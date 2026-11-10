import { describe, it, expect } from 'vitest';
import {
  todayInManila,
  countLeaveDays,
  serviceMonths,
  isEligibleToFile,
  isEligibleForGrant,
  LeaveTypeRule,
} from './leave-rules.js';

describe('leave-rules (pure functions)', () => {
  describe('countLeaveDays', () => {
    it('counts working days excluding weekends', () => {
      // 2026-11-13 is Friday, 2026-11-16 is Monday: Fri, Sat (skip), Sun (skip), Mon = 2 days
      expect(countLeaveDays('2026-11-13', '2026-11-16', 'WORKING_DAYS', new Set())).toBe(2);
    });

    it('returns 0 for weekend-only range in WORKING_DAYS mode', () => {
      // 2026-11-14 is Saturday, 2026-11-15 is Sunday
      expect(countLeaveDays('2026-11-14', '2026-11-15', 'WORKING_DAYS', new Set())).toBe(0);
    });

    it('skips public holidays in WORKING_DAYS mode', () => {
      // 2026-11-27 (Fri) to 2026-12-01 (Tue): Fri (1), Sat, Sun, Mon (Bonifacio Day holiday - skip), Tue (1) = 2 days
      const holidays = new Set(['2026-11-30']);
      expect(countLeaveDays('2026-11-27', '2026-12-01', 'WORKING_DAYS', holidays)).toBe(2);
    });

    it('counts all calendar days in CALENDAR_DAYS mode', () => {
      // Sat to Sun = 2 calendar days
      expect(countLeaveDays('2026-11-14', '2026-11-15', 'CALENDAR_DAYS', new Set())).toBe(2);
    });
  });

  describe('todayInManila', () => {
    it('returns YYYY-MM-DD for Asia/Manila timezone', () => {
      // 23:00 UTC on Nov 10 is 07:00 AM on Nov 11 in Manila (UTC+8)
      const d = new Date('2026-11-10T23:00:00Z');
      expect(todayInManila(d)).toBe('2026-11-11');
    });
  });

  describe('serviceMonths', () => {
    it('calculates completed months of service accurately', () => {
      expect(serviceMonths('2025-11-11', '2026-11-10')).toBe(11);
      expect(serviceMonths('2025-11-10', '2026-11-10')).toBe(12);
      expect(serviceMonths('2026-05-10', '2026-11-10')).toBe(6);
    });
  });

  describe('isEligibleToFile', () => {
    const silRule: LeaveTypeRule = {
      kind: 'YEARLY',
      defaultDays: 5,
      countingMode: 'WORKING_DAYS',
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 12,
    };

    const paternityRule: LeaveTypeRule = {
      kind: 'PER_EVENT',
      defaultDays: 7,
      countingMode: 'WORKING_DAYS',
      eligibleGender: 'MALE',
      eligibleMaritalStatus: 'MARRIED',
      minServiceMonths: 0,
    };

    const maternityRule: LeaveTypeRule = {
      kind: 'PER_EVENT',
      defaultDays: 105,
      countingMode: 'CALENDAR_DAYS',
      eligibleGender: 'FEMALE',
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
    };

    it('allows filing regardless of gender/marital status when not restricted', () => {
      expect(isEligibleToFile(silRule, { gender: 'MALE', maritalStatus: 'SINGLE' })).toBe(true);
      expect(isEligibleToFile(silRule, { gender: 'FEMALE', maritalStatus: 'MARRIED' })).toBe(true);
    });

    it('enforces gender and marital status rules for Paternity (MALE, MARRIED)', () => {
      expect(isEligibleToFile(paternityRule, { gender: 'FEMALE', maritalStatus: 'MARRIED' })).toBe(false);
      expect(isEligibleToFile(paternityRule, { gender: 'MALE', maritalStatus: 'SINGLE' })).toBe(false);
      expect(isEligibleToFile(paternityRule, { gender: 'MALE', maritalStatus: 'MARRIED' })).toBe(true);
    });

    it('enforces gender rules for Maternity (FEMALE)', () => {
      expect(isEligibleToFile(maternityRule, { gender: 'MALE', maritalStatus: 'MARRIED' })).toBe(false);
      expect(isEligibleToFile(maternityRule, { gender: 'FEMALE', maritalStatus: 'SINGLE' })).toBe(true);
    });
  });

  describe('isEligibleForGrant', () => {
    const silRule: LeaveTypeRule = {
      kind: 'YEARLY',
      defaultDays: 5,
      countingMode: 'WORKING_DAYS',
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 12,
    };

    const maternityRule: LeaveTypeRule = {
      kind: 'PER_EVENT',
      defaultDays: 105,
      countingMode: 'CALENDAR_DAYS',
      eligibleGender: 'FEMALE',
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
    };

    it('grants yearly types only if minimum service months are completed', () => {
      // Hired 11 months ago -> not eligible for SIL grant
      expect(isEligibleForGrant(silRule, { hireDate: '2025-11-11' }, '2026-11-10')).toBe(false);
      // Hired 12 months ago -> eligible for SIL grant
      expect(isEligibleForGrant(silRule, { hireDate: '2025-11-10' }, '2026-11-10')).toBe(true);
    });

    it('does not grant per-event types into the yearly ledger', () => {
      expect(isEligibleForGrant(maternityRule, { hireDate: '2020-01-01' }, '2026-11-10')).toBe(false);
    });
  });
});
