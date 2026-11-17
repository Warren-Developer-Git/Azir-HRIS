import { AttendanceStatus } from '@prisma/client';

export interface ShiftConfig {
  startHour: number; // e.g. 9 for 09:00 AM
  startMinute: number;
  gracePeriodMinutes: number; // e.g. 15 mins (up to 09:15 AM)
  endHour: number; // e.g. 18 for 06:00 PM
  endMinute: number;
  workingHours: number; // 8 hours
}

export const DEFAULT_SHIFT: ShiftConfig = {
  startHour: 9,
  startMinute: 0,
  gracePeriodMinutes: 15,
  endHour: 18,
  endMinute: 0,
  workingHours: 8,
};

function getManilaTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

/**
 * Computes tardiness minutes in Asia/Manila timezone.
 * Standard shift: 9:00 AM. Grace period: 15 minutes (09:00 - 09:15 is non-tardy).
 * If clock-in is at 09:20 AM, tardiness is 20 minutes (measured from 09:00 AM).
 */
export function computeLateMinutes(
  timeIn: Date,
  config: ShiftConfig = DEFAULT_SHIFT,
): number {
  const { hour, minute } = getManilaTimeParts(timeIn);
  const currentMinutes = hour * 60 + minute;
  const shiftStartMinutes = config.startHour * 60 + config.startMinute;
  const graceMinutes = shiftStartMinutes + config.gracePeriodMinutes;

  if (currentMinutes <= graceMinutes) {
    return 0;
  }
  return currentMinutes - shiftStartMinutes;
}

/**
 * Computes undertime minutes in Asia/Manila timezone.
 * Standard shift end: 6:00 PM (18:00).
 * If clock-out is at 05:45 PM (17:45), undertime is 15 minutes.
 */
export function computeUndertimeMinutes(
  timeOut: Date,
  config: ShiftConfig = DEFAULT_SHIFT,
): number {
  const { hour, minute } = getManilaTimeParts(timeOut);
  const currentMinutes = hour * 60 + minute;
  const shiftEndMinutes = config.endHour * 60 + config.endMinute;

  if (currentMinutes >= shiftEndMinutes) {
    return 0;
  }
  return shiftEndMinutes - currentMinutes;
}

export interface DetermineStatusInput {
  timeIn?: Date | null;
  timeOut?: Date | null;
  isOnLeave?: boolean;
  isOfficialBusiness?: boolean;
  isHoliday?: boolean;
  isRestDay?: boolean;
  config?: ShiftConfig;
}

/**
 * Evaluates the final attendance status for a given calendar day.
 */
export function determineAttendanceStatus(
  input: DetermineStatusInput,
): AttendanceStatus {
  if (input.isOnLeave) return 'ON_LEAVE';
  if (input.isOfficialBusiness) return 'OFFICIAL_BUSINESS';
  if (input.isHoliday) return 'HOLIDAY';
  if (input.isRestDay) return 'REST_DAY';

  if (!input.timeIn) {
    return 'ABSENT';
  }

  const late = computeLateMinutes(input.timeIn, input.config);
  const undertime = input.timeOut ? computeUndertimeMinutes(input.timeOut, input.config) : 0;

  if (late > 0) return 'LATE';
  if (undertime > 0) return 'UNDERTIME';

  return 'PRESENT';
}

/**
 * Computes the financial deduction for late & undertime minutes.
 * Standard formula: (Monthly Salary / 22 working days / 8 hours / 60 minutes) * totalMinutes.
 */
export function computeTardinessDeduction(
  monthlySalary: number,
  totalLateMinutes: number,
  totalUndertimeMinutes: number,
  workingDays = 22,
): number {
  const totalMinutes = totalLateMinutes + totalUndertimeMinutes;
  if (totalMinutes <= 0 || monthlySalary <= 0) return 0;

  const minuteRate = monthlySalary / workingDays / 8 / 60;
  return Math.round(totalMinutes * minuteRate * 100) / 100;
}

/**
 * Computes the financial deduction for unexcused/unpaid absences.
 * Standard formula: (Monthly Salary / 22 working days) * absentDays.
 */
export function computeAbsenceDeduction(
  monthlySalary: number,
  absentDays: number,
  workingDays = 22,
): number {
  if (absentDays <= 0 || monthlySalary <= 0) return 0;

  const dailyRate = monthlySalary / workingDays;
  return Math.round(absentDays * dailyRate * 100) / 100;
}
