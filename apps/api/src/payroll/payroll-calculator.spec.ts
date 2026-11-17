import { describe, it, expect } from 'vitest';
import {
  calculateDailyRate,
  calculateHourlyRate,
  calculateOvertimePay,
  calculateAbsenceDeduction,
  calculatePhilHealthContribution,
  calculatePagIbigContribution,
  calculateSssContribution,
  calculateWithholdingTax,
  computeSemiMonthlyPayroll,
} from './payroll-calculator.js';

describe('Payroll Calculator - Philippine Statutory & Exact Decimal Math', () => {
  describe('Rate Derivations', () => {
    it('calculates daily rate based on 261 DOLE factor for Monday-Friday workweek', () => {
      // ₱30,000 * 12 / 261 = 1379.3103... -> 1379.31
      const dailyRate = calculateDailyRate(30000);
      expect(dailyRate).toBe(1379.31);
    });

    it('calculates hourly rate based on 8-hour workday', () => {
      // 1379.31 / 8 = 172.41375... -> 172.41
      const hourlyRate = calculateHourlyRate(1379.31);
      expect(hourlyRate).toBe(172.41);
    });

    it('calculates regular overtime pay with standard 1.25x multiplier', () => {
      // 172.41 * 1.25 * 4 hours = 862.05
      const otPay = calculateOvertimePay(172.41, 4);
      expect(otPay).toBe(862.05);
    });

    it('calculates absence deduction for unpaid leaves', () => {
      // 1379.31 * 2 days = 2758.62
      const deduction = calculateAbsenceDeduction(1379.31, 2);
      expect(deduction).toBe(2758.62);
    });
  });

  describe('PhilHealth Contributions (5% Rate)', () => {
    it('clamps to minimum floor of ₱10,000 monthly salary', () => {
      // Salary ₱8,000 clamped to ₱10,000 -> 5% = ₱500/mo -> EE share = ₱250/mo -> Semi-monthly = ₱125.00
      const res = calculatePhilHealthContribution(8000);
      expect(res.employeeShare).toBe(125.00);
      expect(res.employerShare).toBe(125.00);
      expect(res.monthlyTotal).toBe(500.00);
    });

    it('computes standard 5% split for regular salary (e.g. ₱30,000)', () => {
      // ₱30,000 * 5% = ₱1,500/mo -> EE share = ₱750/mo -> Semi-monthly = ₱375.00
      const res = calculatePhilHealthContribution(30000);
      expect(res.employeeShare).toBe(375.00);
      expect(res.employerShare).toBe(375.00);
      expect(res.monthlyTotal).toBe(1500.00);
    });

    it('clamps to maximum ceiling of ₱100,000 monthly salary', () => {
      // Salary ₱150,000 clamped to ₱100,000 -> 5% = ₱5,000/mo -> EE share = ₱2,500/mo -> Semi-monthly = ₱1,250.00
      const res = calculatePhilHealthContribution(150000);
      expect(res.employeeShare).toBe(1250.00);
      expect(res.employerShare).toBe(1250.00);
      expect(res.monthlyTotal).toBe(5000.00);
    });
  });

  describe('Pag-IBIG (HDMF) Contributions', () => {
    it('returns statutory standard ₱100 semi-monthly employee contribution', () => {
      const res = calculatePagIbigContribution(35000);
      expect(res.employeeShare).toBe(100.00);
      expect(res.employerShare).toBe(100.00);
      expect(res.monthlyTotal).toBe(400.00);
    });
  });

  describe('SSS Contributions (Bracket Lookup)', () => {
    it('computes SSS employee and employer share for ₱30,000 monthly salary', () => {
      // MSC for ₱30,000 is ₱30,000 (capped at ₱35,000).
      // Regular SSS rate: EE 4.5% = ₱1,350/mo -> Semi-monthly EE = ₱675.00
      // ER 9.5% = ₱2,850/mo -> Semi-monthly ER = ₱1,425.00
      const res = calculateSssContribution(30000);
      expect(res.msc).toBe(30000);
      expect(res.employeeShare).toBe(675.00);
      expect(res.employerShare).toBe(1425.00);
    });

    it('caps MSC at ₱35,000 for high earners (e.g. ₱75,000)', () => {
      const res = calculateSssContribution(75000);
      expect(res.msc).toBe(35000);
      expect(res.employeeShare).toBe(787.50); // (35,000 * 0.045) / 2
      expect(res.employerShare).toBe(1662.50); // (35,000 * 0.095) / 2
    });
  });

  describe('BIR Withholding Tax (TRAIN Law - Semi-Monthly)', () => {
    it('exempts taxable income <= ₱10,417 (₱0 tax)', () => {
      expect(calculateWithholdingTax(10000)).toBe(0.00);
      expect(calculateWithholdingTax(10417)).toBe(0.00);
    });

    it('calculates 15% of excess over ₱10,417 for Tier 2', () => {
      // Taxable: ₱15,000 -> excess = 4,583 * 0.15 = 687.45
      expect(calculateWithholdingTax(15000)).toBe(687.45);
    });

    it('calculates ₱937.50 + 20% of excess over ₱16,667 for Tier 3', () => {
      // Taxable: ₱25,000 -> excess = 8,333 * 0.20 = 1,666.60 + 937.50 = 2604.10
      expect(calculateWithholdingTax(25000)).toBe(2604.10);
    });

    it('calculates ₱4,270.70 + 25% of excess over ₱33,333 for Tier 4', () => {
      // Taxable: ₱45,000 -> excess = 11,667 * 0.25 = 2,916.75 + 4,270.70 = 7187.45
      expect(calculateWithholdingTax(45000)).toBe(7187.45);
    });
  });

  describe('Full Semi-Monthly Gross-to-Net Payroll Computation', () => {
    it('computes regular salary employee with allowances and zero deductions', () => {
      const result = computeSemiMonthlyPayroll({
        basicSalary: 30000,
        allowances: 2000,
        unpaidLeaveDays: 0,
        overtimeHours: 0,
        bonus: 0,
        manualDeduction: 0,
      });

      // Basic Pay = 15,000.00
      // Allowances = 1,000.00 (non-taxable de minimis)
      // Gross Pay = 16,000.00
      expect(result.basicPay).toBe(15000.00);
      expect(result.allowances).toBe(1000.00);
      expect(result.overtimePay).toBe(0.00);
      expect(result.absencesDeduction).toBe(0.00);
      expect(result.grossPay).toBe(16000.00);

      // Statutory:
      // SSS EE = 675.00
      // PhilHealth EE = 375.00
      // Pag-IBIG EE = 100.00
      // Total Mandatory = 1,150.00
      expect(result.sssEe).toBe(675.00);
      expect(result.philHealthEe).toBe(375.00);
      expect(result.pagIbigEe).toBe(100.00);

      // Taxable Income = 16,000 - 1,000 (allowance) - 1,150 = 13,850.00
      // Tax (Tier 2): (13,850 - 10,417) * 0.15 = 3,433 * 0.15 = 514.95
      expect(result.taxableIncome).toBe(13850.00);
      expect(result.withholdingTax).toBe(514.95);

      // Net Pay = Gross (16,000) - Total Deductions (1,150 + 514.95 = 1,664.95) = 14,335.05
      expect(result.totalDeductions).toBe(1664.95);
      expect(result.netPay).toBe(14335.05);

      // Item lines audit trail is populated
      expect(result.lines.length).toBeGreaterThanOrEqual(6);
      expect(result.lines.map((l) => l.code)).toContain('BASIC');
      expect(result.lines.map((l) => l.code)).toContain('ALLOWANCE');
      expect(result.lines.map((l) => l.code)).toContain('SSS_EE');
      expect(result.lines.map((l) => l.code)).toContain('PHILHEALTH_EE');
      expect(result.lines.map((l) => l.code)).toContain('PAGIBIG_EE');
      expect(result.lines.map((l) => l.code)).toContain('WITHHOLDING_TAX');
    });

    it('correctly deducts unpaid leaves and adds overtime hours', () => {
      const result = computeSemiMonthlyPayroll({
        basicSalary: 30000,
        allowances: 2000,
        unpaidLeaveDays: 1, // 1 day absence = 1379.31
        overtimeHours: 4,    // 4 hours OT = 862.05
        bonus: 500,          // bonus
        manualDeduction: 0,
      });

      expect(result.absencesDeduction).toBe(1379.31);
      expect(result.overtimePay).toBe(862.05);
      // Gross = 15,000 (basic) + 1,000 (allowance) + 862.05 (OT) + 500 (bonus) - 1,379.31 (absences) = 15,982.74
      expect(result.grossPay).toBe(15982.74);
      expect(result.netPay).toBeGreaterThan(0);
    });
  });
});
