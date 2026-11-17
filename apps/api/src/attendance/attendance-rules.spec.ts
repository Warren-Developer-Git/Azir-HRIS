import { describe, it, expect } from 'vitest';
import {
  computeLateMinutes,
  computeUndertimeMinutes,
  determineAttendanceStatus,
  computeTardinessDeduction,
  computeAbsenceDeduction,
  DEFAULT_SHIFT,
} from './attendance-rules.js';

describe('Attendance Domain Rules (Philippine Standard Shift 09:00 - 18:00)', () => {
  // Asia/Manila is UTC+8.
  // 09:00 Manila = 01:00 UTC
  // 09:14 Manila = 01:14 UTC
  // 09:30 Manila = 01:30 UTC
  // 17:45 Manila = 09:45 UTC
  // 18:00 Manila = 10:00 UTC

  it('1. correctly identifies on-time clock in within 15-minute grace period', () => {
    // 08:55 AM Manila
    const early = new Date('2026-11-16T00:55:00.000Z');
    expect(computeLateMinutes(early)).toBe(0);

    // 09:00 AM Manila
    const exact = new Date('2026-11-16T01:00:00.000Z');
    expect(computeLateMinutes(exact)).toBe(0);

    // 09:14 AM Manila (Within 15-min grace period)
    const grace = new Date('2026-11-16T01:14:00.000Z');
    expect(computeLateMinutes(grace)).toBe(0);
  });

  it('2. measures tardiness from 09:00 AM when clock-in exceeds grace period', () => {
    // 09:20 AM Manila (20 mins late from 09:00 AM)
    const late20 = new Date('2026-11-16T01:20:00.000Z');
    expect(computeLateMinutes(late20)).toBe(20);

    // 10:05 AM Manila (65 mins late from 09:00 AM)
    const late65 = new Date('2026-11-16T02:05:00.000Z');
    expect(computeLateMinutes(late65)).toBe(65);
  });

  it('3. correctly identifies undertime when clocking out before 18:00 (06:00 PM)', () => {
    // 17:45 Manila (15 mins undertime)
    const under15 = new Date('2026-11-16T09:45:00.000Z');
    expect(computeUndertimeMinutes(under15)).toBe(15);

    // 18:00 Manila (0 mins undertime)
    const exactOut = new Date('2026-11-16T10:00:00.000Z');
    expect(computeUndertimeMinutes(exactOut)).toBe(0);

    // 18:30 Manila (0 mins undertime)
    const overOut = new Date('2026-11-16T10:30:00.000Z');
    expect(computeUndertimeMinutes(overOut)).toBe(0);
  });

  it('4. assigns appropriate daily attendance status based on exceptions and punches', () => {
    // On Approved Leave overrides missing punches
    expect(determineAttendanceStatus({ isOnLeave: true })).toBe('ON_LEAVE');

    // Approved Official Business overrides punches (0 deduction)
    expect(determineAttendanceStatus({ isOfficialBusiness: true })).toBe('OFFICIAL_BUSINESS');

    // Holiday and Rest Day
    expect(determineAttendanceStatus({ isHoliday: true })).toBe('HOLIDAY');
    expect(determineAttendanceStatus({ isRestDay: true })).toBe('REST_DAY');

    // Absent when no punch and no approved excuse
    expect(determineAttendanceStatus({ timeIn: null })).toBe('ABSENT');

    // Late status
    const latePunch = new Date('2026-11-16T01:30:00.000Z'); // 09:30 AM
    const normalOut = new Date('2026-11-16T10:00:00.000Z'); // 06:00 PM
    expect(
      determineAttendanceStatus({ timeIn: latePunch, timeOut: normalOut }),
    ).toBe('LATE');

    // Undertime status
    const normalIn = new Date('2026-11-16T01:00:00.000Z'); // 09:00 AM
    const earlyOut = new Date('2026-11-16T09:30:00.000Z'); // 05:30 PM
    expect(
      determineAttendanceStatus({ timeIn: normalIn, timeOut: earlyOut }),
    ).toBe('UNDERTIME');

    // Present status
    expect(
      determineAttendanceStatus({ timeIn: normalIn, timeOut: normalOut }),
    ).toBe('PRESENT');
  });

  it('5. computes accurate tardiness deduction based on DOLE minute rate', () => {
    // Monthly salary: 30,000. Working days: 22. Hours: 8. Minute rate = 30000 / 22 / 8 / 60 ≈ 2.8409/min
    // 30 minutes late = 30 * 2.840909... = 85.23
    const deduction = computeTardinessDeduction(30000, 30, 0, 22);
    expect(deduction).toBe(85.23);

    // 0 minutes late = 0 deduction
    expect(computeTardinessDeduction(30000, 0, 0)).toBe(0);
  });

  it('6. computes accurate unexcused absence deduction based on daily rate', () => {
    // Monthly salary: 35,200. Daily rate (22 days) = 1,600.
    // 2 days absent = 3,200.
    const deduction = computeAbsenceDeduction(35200, 2, 22);
    expect(deduction).toBe(3200);

    // 0 days absent = 0 deduction
    expect(computeAbsenceDeduction(35200, 0)).toBe(0);
  });
});
