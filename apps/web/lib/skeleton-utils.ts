const DEFAULT_BAR_WIDTHS = ['w-24', 'w-32', 'w-40', 'w-28', 'w-36'] as const;

/**
 * Normalizes skeleton repetition counts (rows, columns, cards) to a safe integer
 * within [min, max], falling back cleanly for invalid or non-finite values.
 */
export function clampSkeletonCount(
  count: unknown,
  fallback = 5,
  min = 1,
  max = 12,
): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const safeFallback = Number.isFinite(fallback)
    ? Math.min(upper, Math.max(lower, Math.floor(fallback)))
    : lower;

  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return safeFallback;
  }

  return Math.min(upper, Math.max(lower, Math.floor(count)));
}

/**
 * Picks a deterministic Tailwind width class for a skeleton bar so multi-row
 * tables and cards look realistic rather than uniform.
 */
export function getSkeletonBarWidth(
  index: number,
  pattern: readonly string[] = DEFAULT_BAR_WIDTHS,
): string {
  const list = pattern.length > 0 ? pattern : DEFAULT_BAR_WIDTHS;
  if (!Number.isFinite(index)) {
    return list[0];
  }
  const safeIndex = Math.abs(Math.trunc(index)) % list.length;
  return list[safeIndex];
}
