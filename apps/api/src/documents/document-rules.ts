/**
 * Calculates dueAt date by advancing `slaWorkingDays` working days,
 * skipping Saturdays, Sundays, and tenant holidays (DOLE 3-day SLA compliance).
 */
export function calculateDoleDueAt(
  startDate: Date,
  slaWorkingDays: number = 3,
  holidaySet: Set<string> = new Set(),
): Date {
  const current = new Date(startDate.getTime());
  let added = 0;

  while (added < slaWorkingDays) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dayOfWeek = current.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateStr = current.toISOString().slice(0, 10);
    const isHoliday = holidaySet.has(dateStr);

    if (!isWeekend && !isHoliday) {
      added++;
    }
  }

  current.setUTCHours(17, 0, 0, 0);
  return current;
}
