# Cold-Start Wake-Up & Instant Login UX Design Spec

**Date:** 2026-11-18  
**Status:** Proposed (Awaiting Review)

---

## 1. Problem Statement
When the Render free-tier API (`azir-hris-api.onrender.com`) sleeps after 15 minutes of idle time:
1. Visiting `/` (`HomePage`) or `/login` (`LoginPage`) blocks behind a full-screen loading spinner waiting for `AuthProvider`'s `POST /api/auth/refresh` through Vercel's `/api/*` proxy.
2. If Render's cold boot exceeds Vercel's proxy timeout (`~25–30s`), the first request fails (`502`/`504`) and users must refresh the browser manually before the page responds.

---

## 2. Design Decisions

### A. Instant Render on `/` and `/login` + Background Server Warm-Up
- **`apps/web/app/page.tsx`:** Replace the `isLoading`-gated spinner with immediate routing: redirect to `/dashboard` when `user` is present, otherwise `/login` immediately (while `AuthProvider` continues background session restoration and `/login` auto-redirects to `/dashboard` if a valid refresh cookie exists).
- **`apps/web/app/login/page.tsx`:** Remove the `if (isLoading)` full-screen spinner so the sign-in form and Azir Company Global Tech branding render immediately. Fire a silent non-blocking warm-up ping (`fetch('/api/health')`) on mount so Render begins booting while the visitor views or fills the form.
- **`apps/web/app/(app)/layout.tsx`:** Protected routes still keep the `"Loading session..."` gate until `AuthProvider` finishes checking the refresh cookie.

### B. Transient Gateway Wake-Up Retry Helper (`apps/web/lib/wakeup-retry.ts`)
- Extract a pure, unit-testable retry helper `fetchWithWakeupRetry(fetcher, options)` covering:
  - Retrying only when safe (`GET` / `HEAD` / `/auth/login` / `/auth/refresh`) on transient gateway/network failures (`502`, `503`, `504`, or thrown network `TypeError`),
  - Never retrying client/domain HTTP responses (`400`, `401`, `403`, `404`, `409`, `422`, `429`) or non-idempotent business mutations (`POST /leave/requests`, etc.),
  - Bounded retry attempts (`maxRetries`, `delayMs`, `onRetry` callback) so `login()` / UI can display a clear status message (`"Server is waking up from sleep, please wait..."`) rather than a raw timeout failure.
- Integrate `fetchWithWakeupRetry` into `fetchWithAuthRetry` in `apps/web/lib/api.ts` and show a friendly waking-up status notice on `/login` when a retry occurs.
