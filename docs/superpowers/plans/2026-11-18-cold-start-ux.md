# Cold-Start Wake-Up & Instant Login UX Implementation Plan

**Spec:** [2026-11-18-cold-start-ux-design.md](../specs/2026-11-18-cold-start-ux-design.md)  
**Workflow:** Strict TDD (`RED -> GREEN -> REFACTOR`)

---

## Bite-Sized Tasks

### Task 1: Pure `fetchWithWakeupRetry` Helper (TDD)
- **RED:** Create `apps/web/lib/wakeup-retry.test.ts` testing:
  1. Retries `502`/`503`/`504` and network errors on `GET` and `/auth/login` / `/auth/refresh`, returning eventual `200`.
  2. Never retries `400`/`401`/`403`/`404`/`429` or non-idempotent `POST` mutations (`/leave/requests`).
  3. Invokes `onWakingUp` callback cleanly on retry and throws last network error or returns final gateway response once `maxRetries` is exhausted.
  Run `node --test apps/web/lib/wakeup-retry.test.ts` and observe failure (`RED`).
- **GREEN:** Implement `apps/web/lib/wakeup-retry.ts` cleanly and verify `node --test` passes (`GREEN`).

### Task 2: Integrate Retry Helper into `apps/web/lib/api.ts` & Instant `/login` / `/` Render
- Update `apps/web/lib/api.ts` `fetchWithAuthRetry` (and expose optional status listener/helper for waking state) to use `fetchWithWakeupRetry` + `warmUpBackend()`.
- Update `apps/web/app/page.tsx` to route immediately without waiting on `isLoading`.
- Update `apps/web/app/login/page.tsx` to render immediately without blocking on `isLoading`, trigger background `warmUpBackend()`, and display a clear inline `"Server is waking up..."` info alert if login takes >4s or retries a gateway timeout.
- Run `node --test` (all web tests), `pnpm --filter web exec tsc --noEmit --incremental false`, and `eslint` on modified files.
