# Audit & TDD Remediation Plan: External APIs & Security Middleware

**Spec:** [2026-11-16-external-apis-and-middleware-spec.md](../specs/2026-11-16-external-apis-and-middleware-spec.md)  
**Workflow:** Strict TDD (`RED` failing test observed first → `GREEN` minimal change → `REFACTOR`)

---

## Audit Findings Summary

Code review across all changed files in `apps/api/src/settings/`, `apps/api/src/notifications/`, `apps/api/src/common/`, `apps/api/src/app.setup.ts`, `apps/api/src/app.module.ts`, and `apps/api/src/auth/auth.controller.ts` confirmed core RBAC, tenant isolation, XSS escaping, and HTTPS URL validation are solid, with **4 concrete code/test gaps**:

1. **Unstrict query parsing in `HolidaysController.previewExternalHolidays`** (`apps/api/src/settings/holidays.controller.ts:27-33`): Manual `Number.parseInt(yearStr, 10)` accepts partial junk like `year=2026abc` as `2026` instead of throwing `400 Bad Request`. Should validate via `@Query() dto: SyncHolidaysDto` (strict integer check before/through pipe).
2. **Untested provider error paths in `EmailService`** (`apps/api/src/notifications/email.service.ts:135-221`): No unit tests exercise:
   - Resend HTTP 403 JSON error `message` extraction into `outcome.note`
   - Resend `onboarding@resend.dev` sender override avoidance when `GMAIL_SMTP` runs (`EMAIL_FROM` ignoring `onboarding@resend.dev`)
   - `sendViaSmtp` catch branch returning `{ delivered: false, mode: 'GMAIL_SMTP', note }`
3. **Untested automated email trigger in `NotificationsService.notify`** (`apps/api/src/notifications/notifications.service.ts:53-105`): No unit test verifies `notify()` dispatches `EmailService.sendEmail` only when `isConfigured()` is true and swallows provider errors cleanly without breaking transactions.
4. **Untested `RequestLoggerMiddleware` & `POST /notifications/send-email` 10/min throttling** (`apps/api/src/common/request-logger.middleware.ts`, `apps/api/test/security-middleware.e2e-spec.ts`): Middleware log levels (`200`, `400`, `500`) without leaking auth headers and tight `10/min` route throttling lack explicit tests.

---

## Bite-Sized TDD Tasks

### Task 1: Fix Strict Year Validation on `GET /holidays/external-preview`
- **RED:** Add E2E/unit test asserting `GET /holidays/external-preview?year=2026abc` returns `400 Bad Request`. Run test and verify it fails (`200` currently returned).
- **GREEN:** Update `HolidaysController.previewExternalHolidays` to reject non-numeric `year` strings (or bind strict `@Query() query` validation via `SyncHolidaysDto` / strict digit check `/^\d+$/`).
- **REFACTOR:** Keep `HolidaysController` clean with zero duplicated range logic.

### Task 2: Verify `EmailService` Resend Error `note`, `EMAIL_FROM` Sandbox Filter & SMTP Error Catch
- **RED:** Add failing unit tests in `apps/api/src/notifications/email-templates.spec.ts` covering:
  1. `RESEND_API` HTTP 403 JSON `{ message }` extraction into `outcome.note`
  2. `GMAIL_SMTP` ignoring `EMAIL_FROM` containing `onboarding@resend.dev`
  3. `GMAIL_SMTP` rejected promise returning `{ delivered: false, mode: 'GMAIL_SMTP', note }`
- **GREEN / VERIFY:** Run Vitest (`RED` check if any assertion exposes a defect, then `GREEN` confirm all pass cleanly).

### Task 3: Verify `NotificationsService.notify()` Conditional Email Dispatch
- **RED:** Add unit test file `apps/api/src/notifications/notifications.service.spec.ts` testing `notify()` when `emailService.isConfigured()` is `false` (no `sendEmail` call) vs `true` (dispatches email and ignores rejection without failing `notify`).
- **GREEN / VERIFY:** Run unit tests and confirm clean pass.

### Task 4: Verify `RequestLoggerMiddleware` & Route-Level `10/min` Throttling
- **RED:** Add unit test `apps/api/src/common/request-logger.middleware.spec.ts` verifying status-based log levels (`<400`, `>=400`, `>=500`) and absence of headers/body data; add E2E assertion in `security-middleware.e2e-spec.ts` confirming `POST /notifications/send-email` throttles after `10` requests in 60s.
- **GREEN / VERIFY:** Run unit & E2E suites + `build` + `lint` + `web build`.
