import { clampSkeletonCount, getSkeletonBarWidth } from '@/lib/skeleton-utils';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Base monochrome animated placeholder block matching light and dark surfaces.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800',
        className,
      )}
    />
  );
}

interface StatCardsSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton placeholder row for key metric overview cards.
 */
export function StatCardsSkeleton({
  count = 4,
  className,
}: StatCardsSkeletonProps) {
  const safeCount = clampSkeletonCount(count, 4, 1, 8);
  const gridCols =
    safeCount <= 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={cn('grid gap-4', gridCols, className)}>
      {Array.from({ length: safeCount }).map((_, idx) => (
        <div
          key={idx}
          className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className={cn('h-3.5', getSkeletonBarWidth(idx))} />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton matching the main workspace dashboard (attendance strip, KPI cards, and panels).
 */
export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
      className="space-y-6"
    >
      <span className="sr-only">Loading dashboard...</span>

      {/* Quick Attendance Strip Skeleton */}
      <div className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
            <Skeleton className="h-3.5 w-48" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* Stat Cards Skeleton */}
      <StatCardsSkeleton count={4} />

      {/* Two-Column Content Cards Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((panelIdx) => (
          <div
            key={panelIdx}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="space-y-3 pt-1">
              {[0, 1, 2, 3].map((rowIdx) => (
                <div
                  key={rowIdx}
                  className="flex items-center justify-between py-2 border-b last:border-b-0 border-neutral-100 dark:border-neutral-800"
                >
                  <div className="space-y-1.5">
                    <Skeleton
                      className={cn(
                        'h-3.5',
                        getSkeletonBarWidth(rowIdx + panelIdx),
                      )}
                    />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-page application shell skeleton mimicking the sidebar and main container
 * during session hydration or route redirect.
 */
export function AppShellSkeleton({ label = 'Loading session...' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="min-h-screen flex flex-col md:flex-row bg-neutral-50 dark:bg-neutral-950"
    >
      <span className="sr-only">{label}</span>

      {/* Mobile Top Bar Skeleton */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Desktop Sidebar Skeleton */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:justify-between border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shrink-0">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className={cn('h-3.5', getSkeletonBarWidth(idx))} />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-3 px-2">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
          <DashboardSkeleton />
        </div>
      </main>
    </div>
  );
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  showToolbar?: boolean;
  embedded?: boolean;
  className?: string;
}

/**
 * Monochrome table/list skeleton for directory, queue, attendance, payroll, and audit views.
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  showHeader = true,
  showToolbar = false,
  embedded = false,
  className,
}: TableSkeletonProps) {
  const safeRows = clampSkeletonCount(rows, 6, 1, 12);
  const safeColumns = clampSkeletonCount(columns, 5, 1, 8);

  const tableContent = (
    <>
      {showToolbar && (
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row gap-3 justify-between">
          <Skeleton className="h-9 w-full sm:w-64 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      )}

      {showHeader && (
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-950/60 border-b border-neutral-200 dark:border-neutral-800 grid gap-4 items-center grid-cols-2 sm:grid-cols-3 md:grid-flow-col md:auto-cols-fr">
          {Array.from({ length: safeColumns }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className={cn('h-3', getSkeletonBarWidth(colIdx, ['w-20', 'w-24', 'w-16', 'w-28']))}
            />
          ))}
        </div>
      )}

      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {Array.from({ length: safeRows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="px-4 py-3.5 grid gap-4 items-center grid-cols-2 sm:grid-cols-3 md:grid-flow-col md:auto-cols-fr"
          >
            {Array.from({ length: safeColumns }).map((__, colIdx) => (
              <div key={colIdx} className="space-y-1.5">
                <Skeleton
                  className={cn(
                    colIdx === safeColumns - 1 ? 'h-5 w-16 rounded-full' : 'h-3.5',
                    colIdx === safeColumns - 1
                      ? ''
                      : getSkeletonBarWidth(rowIdx + colIdx),
                  )}
                />
                {colIdx === 0 && <Skeleton className="h-2.5 w-20" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading records"
        className={className}
      >
        <span className="sr-only">Loading records...</span>
        {tableContent}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading records"
      className={cn(
        'rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden',
        className,
      )}
    >
      <span className="sr-only">Loading records...</span>
      {tableContent}
    </div>
  );
}

interface DetailPageSkeletonProps {
  cards?: number;
  className?: string;
}

/**
 * Monochrome detail-page skeleton for profile, employee profile, leave detail, and verify views.
 */
export function DetailPageSkeleton({
  cards = 3,
  className,
}: DetailPageSkeletonProps) {
  const safeCards = clampSkeletonCount(cards, 3, 1, 6);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading details"
      className={cn('space-y-6', className)}
    >
      <span className="sr-only">Loading details...</span>

      {/* Top Back Link + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Multi-Card Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {Array.from({ length: Math.max(1, safeCards - 1) }).map((_, cardIdx) => (
            <div
              key={cardIdx}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4"
            >
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {[0, 1, 2, 3].map((fieldIdx) => (
                  <div key={fieldIdx} className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton
                      className={cn(
                        'h-4',
                        getSkeletonBarWidth(cardIdx + fieldIdx),
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((itemIdx) => (
                <div key={itemIdx} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className={cn('h-3.5', getSkeletonBarWidth(itemIdx))} />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
