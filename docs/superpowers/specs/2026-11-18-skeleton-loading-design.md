# Skeleton Loading UI System Design Spec

**Date:** 2026-11-18  
**Status:** Proposed (Awaiting Review)

---

## 1. Goal & Design Principles
Replace traditional centered full-page and full-table `<Loader2 />` spinners across `apps/web` with **layout-matching monochrome skeleton placeholders** (`animate-pulse`) that preserve layout geometry in Light and Dark mode (`bg-neutral-200 dark:bg-neutral-800`), improve perceived responsiveness, and eliminate cumulative layout shift.

### Scope Boundaries
- **Replaced with skeletons:** All session-shell loading gates, full-page initial loaders, data-table loaders, tab panel loaders, and certificate verification/preview card loaders.
- **Kept as inline micro-spinners:** Button-level action feedback on submit (`isSubmitting`, `"Saving..."`, `"Signing in..."`, `"Downloading..."`, `"Uploading..."`) where the user triggered a discrete mutation.

---

## 2. Shared Component Architecture (`apps/web/components/skeletons.tsx` & `apps/web/lib/skeleton-utils.ts`)

Instead of duplicating skeleton markup across 13 files, a single accessible primitive library provides composable presets (`role="status"`, `aria-busy="true"`, screen-reader `<span className="sr-only">Loading...</span>`):

1. **Pure Helper Logic (`apps/web/lib/skeleton-utils.ts` — TDD tested):**
   - `clampSkeletonCount(count, fallback, min, max)`: safely bounds dynamic row/column counts (e.g., `1..12`).
   - `getSkeletonBarWidth(index, pattern)`: deterministic percentage/Tailwind width cycle (`['75%', '60%', '85%', '50%']`) so placeholder bars vary naturally without hydration mismatches (`Math.random()` never used).
2. **Composable Components (`apps/web/components/skeletons.tsx`):**
   - `Skeleton`: base block primitive (`circle`, `rounded`, `className`).
   - `AppShellSkeleton`: renders the mobile sticky header bar or desktop `w-64` sidebar navigation skeleton alongside a responsive main content skeleton for `(app)/layout.tsx` and `/` (`app/page.tsx`).
   - `StatCardsSkeleton`: configurable summary KPI card grid (`columns`, `count`).
   - `DashboardSkeleton`: KPI stat cards + attendance punch widget + two-column recent-requests/approvals panel placeholders.
   - `TableSkeleton`: header bar + `rows x columns` skeleton grid with optional leading `avatar` circle (`employees`, `team`, `approvals`, `leave`, `attendance`, `payroll`, `documents`, `settings`, `audit-logs`).
   - `DetailPageSkeleton`: back link + avatar/badge header + 2–3 column metadata card + body/timeline cards (`profile`, `employees/[id]`, `leave/[id]`, `verify/[code]`, payslip modal preview).

---

## 3. Target Page Inventory (13 Files)
| Surface | File(s) | Skeleton Applied |
|---|---|---|
| Session & Root Gate | `app/(app)/layout.tsx`, `app/page.tsx` | `AppShellSkeleton` |
| Dashboard | `app/(app)/dashboard/page.tsx` | `DashboardSkeleton` |
| Tables & Lists | `approvals`, `employees`, `team`, `leave`, `documents`, `settings`, `audit-logs` | `TableSkeleton` (+ `StatCardsSkeleton` where applicable) |
| Attendance (4 Tabs) | `app/(app)/attendance/page.tsx` | `TableSkeleton` per tab (`DTR`, `Corrections`, `Team`, `Approvals`) |
| Payroll & Payslip Modal | `app/(app)/payroll/page.tsx` | `TableSkeleton` + `DetailPageSkeleton` |
| Detail & Verification Pages | `profile`, `employees/[id]`, `leave/[id]`, `verify/[code]` | `DetailPageSkeleton` |
