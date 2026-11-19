# Design Specification: Gmail REST API (HTTPS Port 443) Delivery for HRIS Emails

**Date:** 2026-11-20  
**Target Modules:** `apps/api/src/notifications/`, `apps/web/components/send-email-modal.tsx`

---

## 1. Problem Statement
On the live Render free-tier API deployment:
1. Outbound SMTP ports (`587`, `465`) are blocked, causing Gmail SMTP (`smtp.gmail.com`) to time out.
2. Fallback to the Resend HTTPS API (`onboarding@resend.dev`) enforces a Resend free-tier sandbox restriction (`HTTP 403`), rejecting emails sent to any recipient other than the Resend account owner's email unless a custom domain is verified.

As a result, emailing colleagues, managers, or external test recipients on the live portal fails inbox delivery.

---

## 2. Goals & Non-Goals

### Goals
- Support sending transactional and manual HRIS emails over standard **HTTPS (`port 443`)** via the **Google Gmail REST API** (`oauth2.googleapis.com/token` + `gmail.googleapis.com/gmail/v1/users/me/messages/send`), which works on Render free tier without owning a custom domain.
- Deliver emails from the configured Gmail account to **any valid recipient email** (preserving `EMAIL_DEMO_OVERRIDE` redirection for synthetic `.test` / `.local` accounts).
- Keep **zero new npm runtime dependencies** by using Node 24's built-in `fetch` and `Buffer` (`base64url`).
- Prevent CRLF email header injection by sanitizing header values (`From`, `To`, `Subject`) and MIME boundaries.
- Update UI status feedback in `SendEmailModal` to recognize `'GMAIL_API'`.

### Non-Goals
- No interactive OAuth browser login flow inside the HRIS app UI (uses server-side OAuth2 `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` configured in `.env` / Render environment variables).
- No removal of existing Gmail SMTP, Resend HTTPS API, or `LOG_ONLY` fallback paths.

---

## 3. Architecture & Behavior

### 3.1 Configuration
- `GMAIL_CLIENT_ID`: Google Cloud OAuth 2.0 Web Client ID
- `GMAIL_CLIENT_SECRET`: Google Cloud OAuth 2.0 Client Secret
- `GMAIL_REFRESH_TOKEN`: OAuth 2.0 Refresh Token granted the `https://www.googleapis.com/auth/gmail.send` scope
- `GMAIL_SENDER_EMAIL` *(optional)*: Explicit sender email address (falls back to `SMTP_USER` when present)
- `EMAIL_PROVIDER` *(optional)*: Supports `'gmail_api'`, `'gmail-api'`, `'resend'`, `'smtp'`

### 3.2 Provider Precedence in `EmailService`
1. `isConfigured()` returns `true` when Gmail HTTPS API, Gmail SMTP, or Resend API credentials are configured.
2. Explicit `EMAIL_PROVIDER` selects the requested primary provider when configured.
3. Default automatic routing:
   - **Gmail HTTPS API** (`GMAIL_API`) first if `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` are present (avoids waiting 10 seconds for blocked SMTP timeouts on Render). If Gmail HTTPS API fails and `RESEND_API_KEY` is set, fall back to `RESEND_API`.
   - Otherwise **Gmail SMTP** (`GMAIL_SMTP`) if `SMTP_USER` + `SMTP_PASS` are present, falling back to `RESEND_API` on failure if `RESEND_API_KEY` is set.
   - Otherwise **Resend API** (`RESEND_API`) if `RESEND_API_KEY` is present.
   - Otherwise **`LOG_ONLY`**.

### 3.3 Security & Data Handling
- All MIME header inputs (`To`, `From`, `Subject`) strip `\r` and `\n` characters to prevent header injection.
- Non-ASCII `Subject` strings are encoded cleanly using RFC 2047 UTF-8 Base64 (`=?UTF-8?B?...?=`).
- Both `text/plain` and `text/html` UTF-8 parts are encoded in `multipart/alternative` and serialized as URL-safe Base64 (`base64url`) per Gmail API `messages.send` requirements.
- Network calls enforce an explicit timeout (`AbortSignal.timeout(8000)`).

---

## 4. Verification Plan
- **Unit Tests (TDD `RED -> GREEN`):** `apps/api/src/notifications/email.service.spec.ts` covering:
  - `isConfigured()` detection across Gmail API, SMTP, Resend, and unconfigured states
  - `buildGmailRawMessage()` RFC 2822 / MIME formatting, UTF-8 subject encoding, and CRLF header injection stripping
  - `sendEmail()` OAuth token exchange + Gmail `messages.send` success path (`mode: 'GMAIL_API'`, `delivered: true`, `providerId`)
  - Fallback to Resend API when Gmail API fails with an HTTP error
  - `EMAIL_DEMO_OVERRIDE` preservation for `.test` accounts
- **Typechecks, Lint & Build:**
  - `pnpm --filter api exec vitest run --configLoader native`
  - `pnpm --filter api exec tsc --noEmit --incremental false -p tsconfig.build.json`
  - `pnpm --filter api lint`
  - `pnpm --filter web exec tsc --noEmit --incremental false`
  - `pnpm --filter web exec eslint "components/send-email-modal.tsx"`
