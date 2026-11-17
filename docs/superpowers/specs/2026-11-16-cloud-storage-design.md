# SDD Specification: Cloud Object Storage (Avatars & Leave Attachments)

**Project:** Azir Company Global Tech — Multi-Tenant HRMS  
**Date:** 2026-11-16  
**Milestone:** Activity 9 — Cloud Storage (`$0` / No Credit Card)  
**Design Standards:** Spec-Driven Development (SDD), Test-Driven Development (TDD), Multi-Tenant RLS Isolation

---

## 1. Executive Summary

Replaces inline base64 avatar storage in PostgreSQL with real file uploads backed by **Supabase Storage** (`$0` free tier, 1 GB, no credit card required) via built-in `fetch()`, with an automatic **local disk fallback** (`apps/api/uploads/`) when Supabase environment variables are absent or during automated tests.

Covers two real HRMS workflows:
1. **Employee Profile Avatar Upload (`POST /me/avatar`, `DELETE /me/avatar`):** Uploads cropped profile images (`<= 2 MB`), stores real URLs in `Employee.avatarUrl`, and deletes superseded objects on replacement/removal.
2. **Leave Request Supporting Attachments (`POST /leave/attachments` + `LeaveRequest.attachmentUrl`):** Allows uploading medical/supporting documents (`PDF`, `JPG`, `PNG`, `WEBP`, `<= 5 MB`) when filing leave, validates attachment presence when `LeaveType.requiresAttachment` is `true`, and serves downloads privately through a tenant-verified endpoint (`GET /storage/download`).

---

## 2. Architecture & Storage Provider Strategy

### 2.1 Environment Variables (`apps/api/.env`)
- `SUPABASE_URL` — e.g. `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase server secret (never exposed to browser)
- `SUPABASE_STORAGE_BUCKET` — e.g. `hrms-files`
- `LOCAL_UPLOAD_DIR` — optional override for local fallback directory (default `apps/api/uploads`)

When `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET` are all non-empty, `StorageService` reports mode `'SUPABASE_STORAGE'`; otherwise it uses `'LOCAL_DISK'`.

### 2.2 Object Key Structure & Isolation
All object keys are generated server-side using random UUIDs (`crypto.randomUUID()`) — never trusting user filenames as paths:
- Public avatars: `public/${tenantId}/avatars/${uuid}.${ext}`
- Private leave attachments: `tenants/${tenantId}/leave-attachments/${uuid}.${ext}`

---

## 3. Security, Validation & Access Control

### 3.1 File Upload Validation
- **Avatars (`category: 'avatar'`):**
  - Max size: `2 MB` (`2 * 1024 * 1024` bytes)
  - Allowed MIME types & extensions: `image/jpeg` (`.jpg`), `image/png` (`.png`), `image/webp` (`.webp`)
  - Magic-byte header verification matching JPEG/PNG/WEBP signatures so renamed `.exe`/HTML files are rejected with `400 BadRequestException`.
- **Leave Attachments (`category: 'leave-attachment'`):**
  - Max size: `5 MB` (`5 * 1024 * 1024` bytes)
  - Allowed MIME types & extensions: `application/pdf` (`.pdf`), `image/jpeg` (`.jpg`), `image/png` (`.png`), `image/webp` (`.webp`)
  - Magic-byte signature check (`%PDF-`, JPEG, PNG, WEBP) before writing to storage.

### 3.2 Access Control
- **Avatar Routes (`POST /me/avatar`, `DELETE /me/avatar`):** Authenticated user (`JwtAuthGuard`); updates only `user.employeeId` inside `withTenant(user.tenantId)` and logs an audit entry (`AuditService`).
- **Avatar Read:**
  - In `SUPABASE_STORAGE` mode, returns `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}` (for `<img src>`).
  - In `LOCAL_DISK` mode, returns `/api/storage/public/${tenantId}/avatars/${file}` served by `GET /storage/public/:tenantId/avatars/:filename` (marked `@Public()`, strictly validating UUID filename & path canonicalization with `nosniff`).
- **Leave Attachment Upload (`POST /leave/attachments`):** Requires `leave.file` permission; returns `{ key, url, fileName, mimeType, sizeBytes, provider }`.
- **Protected Download (`GET /storage/download?key=...`):** Requires `JwtAuthGuard`. Rejects keys not starting with `tenants/${user.tenantId}/` with `403 ForbiddenException`, preventing cross-tenant IDOR. Streams bytes from Supabase Storage (private-bucket compatible via service role key) or local disk with `Content-Type` and `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.

---

## 4. Database Schema & Migration (`apps/api/prisma/schema.prisma`)

Non-destructive addition to `LeaveRequest` (preserves all existing records):
```prisma
model LeaveRequest {
  // ...existing columns...
  attachmentKey  String?
  attachmentName String?
}
```
And on `Employee`, store `avatarKey String?` alongside existing `avatarUrl String?` so replacing/removing an avatar deletes the prior stored object cleanly without touching legacy rows where `avatarKey` is `null`.

---

## 5. Business Rules Update (`LeaveRequestsService`)
- `CreateLeaveRequestDto` accepts optional `attachmentKey?: string` and `attachmentName?: string`.
- If provided, `attachmentKey` must begin with `tenants/${user.tenantId}/leave-attachments/` (`400 BadRequestException` otherwise).
- When `leaveType.requiresAttachment === true` and `attachmentKey` is missing, `fileRequest` throws `400 BadRequestException('Supporting attachment is required for this leave type')`.

---

## 6. Frontend Integration (`apps/web`)
1. **`apps/web/app/(app)/profile/page.tsx`:**
   - Replace base64 `PATCH /me/profile { avatarUrl: dataUrl }` with `canvas.toBlob(..., 'image/jpeg', 0.85)` uploaded via `FormData` to `POST /me/avatar`, and call `DELETE /me/avatar` on remove.
2. **`apps/web/app/(app)/leave/new/page.tsx`:**
   - Display leave attachment file uploader (`PDF / JPG / PNG / WEBP`, max `5 MB`), highlighting **"Required for this leave type"** when `selectedType.requiresAttachment` is `true`. Uploads file first via `POST /leave/attachments`, then submits `attachmentKey` & `attachmentName` with `POST /leave/requests`.
3. **`apps/web/app/(app)/leave/[id]/page.tsx`:**
   - When `request.attachmentKey` is present, render a download/view button that fetches `/storage/download?key=...` using the in-memory Bearer token (`getAccessToken()`) and opens/saves the file securely.
