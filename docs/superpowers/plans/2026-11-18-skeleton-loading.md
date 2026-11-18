# Skeleton Loading UI Implementation Plan

**Spec:** [2026-11-18-skeleton-loading-design.md](../specs/2026-11-18-skeleton-loading-design.md)  
**Workflow:** Strict TDD (`RED -> GREEN -> REFACTOR`)

---

## Bite-Sized Tasks

### Task 1: Pure Skeleton Sizing & Deterministic Width Helpers (TDD)
- **RED:** Create `apps/web/lib/skeleton-utils.test.ts` testing `clampSkeletonCount` bounds/fallbacks and `getSkeletonBarWidth` deterministic cycling (zero randomness). Run `node --test apps/web/lib/skeleton-utils.test.ts` and observe failure (`RED`).
- **GREEN:** Implement `apps/web/lib/skeleton-utils.ts` cleanly and verify `node --test` passes (`GREEN`).

### Task 2: Reusable Monochrome Skeleton Components (`apps/web/components/skeletons.tsx`)
- Build `Skeleton`, `AppShellSkeleton`, `StatCardsSkeleton`, `DashboardSkeleton`, `TableSkeleton`, and `DetailPageSkeleton` matching Light & Dark monochrome theme tokens (`bg-neutral-200 dark:bg-neutral-800 animate-pulse`), mobile responsiveness, and `aria-busy="true"` accessibility.

### Task 3: Replace Spinners in App Shell, Dashboard & Detail Pages
- Update `app/(app)/layout.tsx`, `app/page.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/employees/[id]/page.tsx`, `app/(app)/leave/[id]/page.tsx`, and `app/verify/[code]/page.tsx`.

### Task 4: Replace Spinners in Table, Tab & Document Pages + CI Update
- Update `app/(app)/employees/page.tsx`, `app/(app)/team/page.tsx`, `app/(app)/approvals/page.tsx`, `app/(app)/leave/page.tsx`, `app/(app)/attendance/page.tsx`, `app/(app)/payroll/page.tsx`, `app/(app)/documents/page.tsx`, `app/(app)/settings/page.tsx`, and `app/(app)/audit-logs/page.tsx`.
- Update `.github/workflows/ci.yml` `verify-web` to execute `apps/web/lib/skeleton-utils.test.ts` and lint `lib/skeleton-utils.ts` + `components/skeletons.tsx`.

### Task 5: Full Verification & Commit Prep
- Run all web unit tests (`node --test`), `tsc --noEmit`, `eslint` on new/modified files, and `next build` (if unlocked, otherwise disclose cleanly and verify via CI), then review with user before committing/pushing.
