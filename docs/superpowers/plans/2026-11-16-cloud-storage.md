# Cloud Object Storage Implementation Plan

**Spec:** [2026-11-16-cloud-storage-design.md](../specs/2026-11-16-cloud-storage-design.md)  
**Workflow:** Strict TDD (`RED` failing test verified first → `GREEN` minimal implementation → `REFACTOR`) + Review-First gate before implementation begins.

---

## File Map

- **Database & Env:**
  - Modify: `apps/api/prisma/schema.prisma` (`Employee.avatarKey`, `LeaveRequest.attachmentKey`, `LeaveRequest.attachmentName`)
  - Create: `apps/api/prisma/migrations/<timestamp>_add_storage_fields/migration.sql`
  - Modify: `apps/api/.env.example`, `.gitignore` (`apps/api/uploads/`)
  - Modify: `apps/api/package.json` (`@types/multer` devDependency if needed for `Express.Multer.File`)
- **Storage Module (`apps/api/src/storage/`):**
  - Create: `apps/api/src/storage/storage.service.ts`
  - Create: `apps/api/src/storage/storage.controller.ts`
  - Create: `apps/api/src/storage/storage.module.ts`
  - Create: `apps/api/src/storage/storage.service.spec.ts` (unit tests)
  - Modify: `apps/api/src/app.module.ts` (import `StorageModule`)
- **Employees & Leave Integration:**
  - Modify: `apps/api/src/employees/profile.controller.ts`, `apps/api/src/employees/employees.service.ts`, `apps/api/src/employees/employees.module.ts`
  - Modify: `apps/api/src/leave/leave-requests.controller.ts`, `apps/api/src/leave/leave-requests.service.ts`, `apps/api/src/leave/dto/create-leave-request.dto.ts`, `apps/api/src/leave/leave.module.ts`
  - Create: `apps/api/test/storage.e2e-spec.ts`
- **Frontend UI (`apps/web/`):**
  - Modify: `apps/web/app/(app)/profile/page.tsx`
  - Modify: `apps/web/app/(app)/leave/new/page.tsx`
  - Modify: `apps/web/app/(app)/leave/[id]/page.tsx`

---

## Tasks (Strict RED → GREEN → REFACTOR)

### Task 1: Magic-Byte Validation & `StorageService` Provider Selection (`Supabase` vs `LOCAL_DISK`)
- **RED:** Create `apps/api/src/storage/storage.service.spec.ts` testing:
  1. Rejects spoofed `.exe`/text buffer claiming `image/jpeg` (`BadRequestException`)
  2. Rejects files over category limit (`> 2 MB` avatar, `> 5 MB` attachment)
  3. Writes valid JPEG/PDF buffers to `LOCAL_DISK` fallback and reads/deletes them safely (blocking `..` path traversal)
  4. Uses Supabase Storage REST `POST`/`GET`/`DELETE` with bearer auth when `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` are set
  Run Vitest (`RED` fails because `storage.service.ts` does not exist yet).
- **GREEN:** Implement `apps/api/src/storage/storage.service.ts` and `storage.module.ts`; run Vitest to pass.
- **REFACTOR:** Keep validation table-driven by `StorageCategory` (`avatar` | `leave-attachment`).

### Task 2: Storage HTTP Endpoints (`GET /storage/public/:tenantId/avatars/:filename` & `GET /storage/download`)
- **RED:** Add unit tests checking `StorageController` rejects cross-tenant `key` access on `/storage/download` with `ForbiddenException` and validates avatar filenames cleanly. Run Vitest (`RED`).
- **GREEN:** Implement `apps/api/src/storage/storage.controller.ts`, wire `StorageModule` in `AppModule`, and add `SUPABASE_*` comments to `.env.example` + ignore `apps/api/uploads/` in `.gitignore`. Run Vitest (`GREEN`).

### Task 3: Prisma Migration for `Employee.avatarKey` & `LeaveRequest.attachmentKey/attachmentName`
- **Step:** Update `apps/api/prisma/schema.prisma`, generate non-destructive migration, apply cleanly to `hrms` and `hrms_test`, and run `prisma generate`.

### Task 4: Employee Profile Avatar Upload & Cleanup (`POST /me/avatar`, `DELETE /me/avatar`)
- **RED:** Write failing tests in `apps/api/src/employees/profile-avatar.spec.ts` (and `apps/api/test/storage.e2e-spec.ts`) asserting:
  1. Valid JPEG upload stores object via `StorageService`, saves `avatarUrl` + `avatarKey`, and records an audit log
  2. Uploading a second avatar or calling `DELETE /me/avatar` deletes the previous `avatarKey`
  3. Non-image upload fails with `400`
  Run unit test (`RED`).
- **GREEN:** Import `StorageModule` in `EmployeesModule`; implement `uploadAvatar` / `removeAvatar` in `EmployeesService` + `ProfileController` with `FileInterceptor` (`2 MB` cap). Run Vitest (`GREEN`).

### Task 5: Leave Attachment Upload & Required-Attachment Rule (`POST /leave/attachments`, `POST /leave/requests`)
- **RED:** Write failing tests in `apps/api/src/leave/leave-attachment.spec.ts` (and `apps/api/test/storage.e2e-spec.ts`) asserting:
  1. `POST /leave/attachments` validates PDF/image up to `5 MB` and returns `tenants/<tenantId>/leave-attachments/...` key
  2. `fileRequest` rejects `attachmentKey` belonging to another tenant (`BadRequestException`)
  3. `fileRequest` rejects missing `attachmentKey` when `leaveType.requiresAttachment === true`
  Run unit test (`RED`).
- **GREEN:** Update `LeaveModule`, `CreateLeaveRequestDto`, `LeaveRequestsController`, and `LeaveRequestsService`. Run Vitest (`GREEN`).

### Task 6: Frontend Profile Avatar Upload & Leave Attachment UI (`apps/web`)
- **Step:** Update:
  - `apps/web/app/(app)/profile/page.tsx` (`FormData` upload to `POST /me/avatar`, `DELETE /me/avatar`)
  - `apps/web/app/(app)/leave/new/page.tsx` (file upload to `POST /leave/attachments`, required badge when `requiresAttachment === true`)
  - `apps/web/app/(app)/leave/[id]/page.tsx` (authenticated download via `GET /storage/download?key=...` with Bearer token)

### Task 7: Full Verification Gate (`verification-before-completion`)
- Run `pnpm --filter api build`, `pnpm --filter api lint`, `pnpm --filter api exec vitest run --configLoader native`, `pnpm --filter web build`, and E2E tests (flagging DB reachability if host PostgreSQL is isolated from sandbox).
