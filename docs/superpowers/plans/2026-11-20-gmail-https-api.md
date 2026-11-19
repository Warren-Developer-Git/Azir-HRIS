# Implementation Plan: Gmail REST API (HTTPS Port 443) Delivery

**Spec:** [2026-11-20-gmail-https-api-design.md](../specs/2026-11-20-gmail-https-api-design.md)

---

### Task 1 — TDD Unit Tests for `EmailService` & Gmail MIME Builder (`RED`)
- **File:** `apps/api/src/notifications/email.service.spec.ts`
- **Steps:**
  1. Write failing Vitest specs for:
     - `EmailService.isConfigured()` returning `true` when Gmail API OAuth env vars are set without SMTP/Resend.
     - `buildGmailRawMessage()` producing valid CRLF-separated `multipart/alternative` MIME (`text/plain` + `text/html`), stripping `\r`/`\n` from `To`/`From`/`Subject`, and URL-safe Base64 encoding.
     - `EmailService.sendEmail()` mocking global `fetch` to exchange `GMAIL_REFRESH_TOKEN` at `oauth2.googleapis.com/token` and dispatch via `gmail.googleapis.com/gmail/v1/users/me/messages/send`, returning `{ delivered: true, mode: 'GMAIL_API', providerId }`.
     - Fallback to `RESEND_API` if `GMAIL_API` fails and `RESEND_API_KEY` is configured.
  2. Run `pnpm --filter api exec vitest run --configLoader native src/notifications/email.service.spec.ts` and confirm `RED`.

### Task 2 — Implement Gmail HTTPS API Support in `EmailService` (`GREEN`)
- **File:** `apps/api/src/notifications/email.service.ts`
- **Steps:**
  1. Add `'GMAIL_API'` to `EmailSendOutcome['mode']`.
  2. Export pure helper `buildGmailRawMessage(input)` with header sanitization and RFC 2047 UTF-8 subject encoding.
  3. Add `getGmailApiConfig()` and `sendViaGmailApi()` using `oauth2.googleapis.com/token` + `gmail.googleapis.com/gmail/v1/users/me/messages/send` (`AbortSignal.timeout(8000)`).
  4. Update `isConfigured()` and `sendEmail()` precedence & Resend fallback cleanly.
  5. Re-run `email.service.spec.ts` and observe `GREEN`.

### Task 3 — Update `SendEmailModal`, `.env.example`, and `README.md`
- **Files:**
  - `apps/web/components/send-email-modal.tsx`
  - `apps/api/.env.example`
  - `README.md`
- **Steps:**
  1. Update `SendEmailModal` response `mode` union and display text for `'GMAIL_API'` (`Gmail HTTPS API`).
  2. Document `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and optional `GMAIL_SENDER_EMAIL` in `apps/api/.env.example` and `README.md`.

### Task 4 — Verification & User Credential Walkthrough
- **Steps:**
  1. Run full API unit test suite, API lint, API typecheck (`tsconfig.build.json`), API build, Web typecheck, and ESLint on `components/send-email-modal.tsx`.
  2. Provide the user with step-by-step Google Cloud Console + OAuth 2.0 Playground instructions to generate `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` for Render.
