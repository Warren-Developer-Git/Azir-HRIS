# SDD Specification: External API Integrations & HTTP Security Middleware

**Project:** Azir Company Global Tech — Multi-Tenant HRMS  
**Date:** 2026-11-16  
**Milestone:** Pre-Defense Quality Audit (Activities 6, 8, & 10)  
**Design Standards:** Spec-Driven Development (SDD), Test-Driven Development (TDD), Multi-Tenant RLS Isolation

---

## 1. Scope & Purpose

This specification backfills and locks the formal functional, security, and verification contracts for:
1. **External API #1 — Nager.Date Public Holidays Sync** (`GET /holidays/external-preview`, `POST /holidays/sync`)
2. **External API #2 — Multi-Transport Email Dispatch & Meeting Invites** (`EmailService`, `POST /notifications/send-email`, automated workflow alerts)
3. **HTTP Security Middleware, Optimization & Rate Limiting** (`configureApp`, `RequestLoggerMiddleware`, `@nestjs/throttler`)

---

## 2. External API #1: Nager.Date Public Holidays Sync

### 2.1 Functional Requirements
- **Preview (`GET /holidays/external-preview`):** Accepts optional `year` (`2000..2100`, integer) and `countryCode` (2-letter ISO code, default `PH`). Fetches public holidays from `https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}` with an 8s timeout, deduplicates multiple entries on the same calendar date, and classifies Philippine holidays into `REGULAR` vs `SPECIAL`.
- **Sync (`POST /holidays/sync`):** Idempotently inserts only holiday dates not already present for that `tenantId` in that year. Re-running sync for the same year/country creates `0` duplicates and reports `skippedCount`.
- **RBAC & Audit:** Both endpoints require `holiday.write` permission (`ADMIN`, `HR`). Sync writes an immutable audit log (`entity: 'Holiday'`, `action: 'sync'`).

### 2.2 Error Handling & Security
- Invalid `year` strings (e.g., `2026abc`) or invalid `countryCode` must fail with `400 Bad Request` (not silently `parseInt` partial digits).
- External `404` maps to `404 NotFoundException`; network/timeout/malformed JSON/unexpected payload maps to `502 BadGatewayException`.

---

## 3. External API #2: Email Dispatch & Meeting Invites

### 3.1 Transport Priority & Routing
1. **Gmail SMTP (`GMAIL_SMTP`):** Selected first when `SMTP_USER` and `SMTP_PASS` are configured (strips whitespace from Google 16-char App Passwords; ignores `onboarding@resend.dev` when setting `from`).
2. **Resend REST API (`RESEND_API`):** Selected when SMTP is unconfigured and `RESEND_API_KEY` is configured (`https://api.resend.com/emails`, 8s timeout). On non-2xx responses (e.g., HTTP 403 sandbox restriction), extracts JSON `message` into `note` and returns `delivered: false`.
3. **Offline Fallback (`LOG_ONLY`):** Logs queued message when neither provider is configured.
- **Synthetic Demo Routing (`EMAIL_DEMO_OVERRIDE`):** Emails ending in `.test` or `.local` redirect to `EMAIL_DEMO_OVERRIDE` while preserving original `recipientEmail` and adding `routedDemoRecipientNote`.

### 3.2 Templates, Validation & Authorization
- Supports presets `GENERAL_NOTICE`, `MEETING_INVITE`, `DOCUMENT_NOTICE`, `ATTENDANCE_NOTICE` with smart default subject/body when left blank.
- **XSS / URL Hardening:** HTML-escapes all interpolated fields (`<`, `>`, `&`, `"`, `'`) and rejects non-`https://` `meetingUrl` values (`http://`, `javascript:`, invalid URLs) with `400 BadRequestException`.
- **RBAC & Team Scope:**
  - `email.send` (`ADMIN`, `HR`) can email any active tenant employee.
  - `email.send_team` (`MANAGER`) can email only direct reports (`targetEmp.managerId === user.employeeId`).
  - Regular `EMPLOYEE` receives `403 Forbidden`.
- **Hermetic E2E Testing:** `test/global-setup.ts` neutralizes `SMTP_USER`, `SMTP_PASS`, and `RESEND_API_KEY` with empty strings so Prisma's dotenv loader does not re-populate live credentials during automated test runs.

---

## 4. HTTP Security Middleware, Compression & Rate Limiting

### 4.1 Global Express Middleware (`configureApp`)
- **Helmet:** Sets security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, etc.) and removes `X-Powered-By`.
- **Compression:** Applies `gzip` response compression for eligible JSON payloads (`Accept-Encoding: gzip`).
- **CORS:** Allows comma-separated `APP_WEB_URL` origins (default `http://localhost:3000`) with `credentials: true`; does not grant `Access-Control-Allow-Origin` to untrusted origins.
- **ValidationPipe:** `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

### 4.2 Request Logger & Rate Limiting
- **`RequestLoggerMiddleware`:** Logs `${method} ${originalUrl} ${statusCode} (${durationMs}ms)` without recording headers, cookies, or request/response bodies. Uses `error` for `>= 500`, `warn` for `>= 400`, `log` for `< 400`.
- **`ThrottlerGuard` (Global + Sensitive Routes):**
  - Default: `120` requests / `60s`.
  - `POST /auth/login` & `POST /auth/refresh`: `15` requests / `60s` (`429 Too Many Requests` on overflow).
  - `POST /notifications/send-email` & `POST /holidays/sync`: `10` requests / `60s`.
