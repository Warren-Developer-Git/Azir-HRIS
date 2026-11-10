import {
  Gender,
  MaritalStatus,
  LeaveKind,
  CountingMode,
} from '@prisma/client';

export type LeaveTypeRule = {
  kind: LeaveKind;
  defaultDays: number;
  countingMode: CountingMode;
  eligibleGender: Gender | null;
  eligibleMaritalStatus: MaritalStatus | null;
  minServiceMonths: number;
};

/**
 * Returns the current date in Asia/Manila formatted as YYYY-MM-DD.
 */
export function todayInManila(now?: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now ?? new Date());
}

/**
 * Counts leave days between start and end (inclusive).
 * Dates must be formatted as 'YYYY-MM-DD'.
 */
export function countLeaveDays(
  start: string,
  end: string,
  mode: CountingMode,
  holidays: Set<string>,
): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);

  const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const finish = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  if (current.getTime() > finish.getTime()) {
    return 0;
  }

  let count = 0;
  while (current.getTime() <= finish.getTime()) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    if (mode === 'CALENDAR_DAYS') {
      count++;
    } else {
      // WORKING_DAYS skips Saturday (6), Sunday (0), and holidays
      const dayOfWeek = current.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.has(dateStr);

      if (!isWeekend && !isHoliday) {
        count++;
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * Calculates completed months of service between hireDate and onDate.
 */
export function serviceMonths(hireDate: string, onDate: string): number {
  const [hY, hM, hD] = hireDate.split('-').map(Number);
  const [oY, oM, oD] = onDate.split('-').map(Number);

  let months = (oY - hY) * 12 + (oM - hM);
  if (oD < hD) {
    months--;
  }

  return Math.max(0, months);
}

/**
 * Checks if an employee is eligible to file a specific leave type based on gender and marital status.
 */
export function isEligibleToFile(
  type: LeaveTypeRule,
  emp: { gender: Gender; maritalStatus: MaritalStatus },
): boolean {
  if (type.eligibleGender && type.eligibleGender !== emp.gender) {
    return false;
  }
  if (
    type.eligibleMaritalStatus &&
    type.eligibleMaritalStatus !== emp.maritalStatus
  ) {
    return false;
  }
  return true;
}

/**
 * Checks if an employee is eligible for an annual balance grant on a given date.
 */
export function isEligibleForGrant(
  type: LeaveTypeRule,
  emp: { hireDate: string },
  onDate: string,
): boolean {
  if (type.kind !== 'YEARLY') {
    return false;
  }
  return serviceMonths(emp.hireDate, onDate) >= type.minServiceMonths;
}
