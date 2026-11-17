export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateDailyRate(basicMonthlySalary: number, workingDaysYear = 261): number {
  return round((basicMonthlySalary * 12) / workingDaysYear, 2);
}

export function calculateHourlyRate(dailyRate: number): number {
  return round(dailyRate / 8, 2);
}

export function calculateOvertimePay(
  hourlyRate: number,
  hours: number,
  multiplier = 1.25,
): number {
  if (hours <= 0) return 0;
  return round(hourlyRate * hours * multiplier, 2);
}

export function calculateAbsenceDeduction(dailyRate: number, unpaidDays: number): number {
  if (unpaidDays <= 0) return 0;
  return round(dailyRate * unpaidDays, 2);
}

export interface StatutoryContributionResult {
  employeeShare: number;
  employerShare: number;
  monthlyTotal: number;
}

export interface SssContributionResult {
  msc: number;
  employeeShare: number;
  employerShare: number;
}

/**
 * PhilHealth 5% contribution calculation (Philippine standard)
 * Floor: ₱10,000 / Ceiling: ₱100,000
 */
export function calculatePhilHealthContribution(monthlySalary: number): StatutoryContributionResult {
  const clampedSalary = Math.min(Math.max(monthlySalary, 10000), 100000);
  const monthlyTotal = round(clampedSalary * 0.05, 2);
  const monthlyEe = round(monthlyTotal / 2, 2);
  const monthlyEr = round(monthlyTotal - monthlyEe, 2);

  // Split equally into semi-monthly cutoffs
  const employeeShare = round(monthlyEe / 2, 2);
  const employerShare = round(monthlyEr / 2, 2);

  return {
    employeeShare,
    employerShare,
    monthlyTotal,
  };
}

/**
 * Pag-IBIG (HDMF) contribution calculation
 * Standard statutory contribution: ₱200/mo EE and ₱200/mo ER for monthly salary > ₱1,500
 */
export function calculatePagIbigContribution(monthlySalary: number): StatutoryContributionResult {
  const monthlyEe = 200.00;
  const monthlyEr = 200.00;
  return {
    employeeShare: round(monthlyEe / 2, 2),
    employerShare: round(monthlyEr / 2, 2),
    monthlyTotal: 400.00,
  };
}

/**
 * SSS contribution bracket calculation
 * MSC range: ₱5,000 to ₱35,000 (steps of ₱500)
 * Regular SSS contribution rate: 14% (Employee 4.5%, Employer 9.5%)
 */
export function calculateSssContribution(monthlySalary: number): SssContributionResult {
  let msc = 5000;
  if (monthlySalary < 5250) {
    msc = 5000;
  } else if (monthlySalary >= 34750) {
    msc = 35000;
  } else {
    msc = Math.floor((monthlySalary - 4750) / 500) * 500 + 5000;
  }

  const monthlyEe = round(msc * 0.045, 2);
  const monthlyEr = round(msc * 0.095, 2);

  return {
    msc,
    employeeShare: round(monthlyEe / 2, 2),
    employerShare: round(monthlyEr / 2, 2),
  };
}

/**
 * BIR Revised TRAIN Law Semi-Monthly Withholding Tax Table
 */
export function calculateWithholdingTax(semiMonthlyTaxableIncome: number): number {
  if (semiMonthlyTaxableIncome <= 10417) {
    return 0.00;
  }
  if (semiMonthlyTaxableIncome <= 16666.99) {
    return round((semiMonthlyTaxableIncome - 10417) * 0.15, 2);
  }
  if (semiMonthlyTaxableIncome <= 33332.99) {
    return round(937.50 + (semiMonthlyTaxableIncome - 16667) * 0.20, 2);
  }
  if (semiMonthlyTaxableIncome <= 83332.99) {
    return round(4270.70 + (semiMonthlyTaxableIncome - 33333) * 0.25, 2);
  }
  if (semiMonthlyTaxableIncome <= 333332.99) {
    return round(16770.70 + (semiMonthlyTaxableIncome - 83333) * 0.30, 2);
  }
  return round(91770.70 + (semiMonthlyTaxableIncome - 333333) * 0.35, 2);
}

export interface PayrollComputeInput {
  basicSalary: number;
  allowances?: number;
  unpaidLeaveDays?: number;
  tardinessMinutes?: number;
  overtimeHours?: number;
  bonus?: number;
  manualDeduction?: number;
}

export interface PayrollComputedLine {
  category: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  code: string;
  description: string;
  amount: number;
  rate?: number;
  quantity?: number;
}

export interface PayrollComputeResult {
  dailyRate: number;
  hourlyRate: number;
  basicPay: number;
  allowances: number;
  overtimePay: number;
  absencesDeduction: number;
  bonus: number;
  grossPay: number;
  sssEe: number;
  sssEr: number;
  philHealthEe: number;
  philHealthEr: number;
  pagIbigEe: number;
  pagIbigEr: number;
  taxableIncome: number;
  withholdingTax: number;
  manualDeduction: number;
  totalDeductions: number;
  netPay: number;
  lines: PayrollComputedLine[];
}

/**
 * Complete Semi-Monthly Gross-to-Net Payroll Computation
 */
export function computeSemiMonthlyPayroll(input: PayrollComputeInput): PayrollComputeResult {
  const basicSalary = Number(input.basicSalary) || 0;
  const allowancesMonthly = Number(input.allowances) || 0;
  const unpaidDays = Number(input.unpaidLeaveDays) || 0;
  const tardinessMinutes = Number(input.tardinessMinutes) || 0;
  const otHours = Number(input.overtimeHours) || 0;
  const bonus = Number(input.bonus) || 0;
  const manualDeduction = Number(input.manualDeduction) || 0;

  // Rate calculations
  const dailyRate = calculateDailyRate(basicSalary);
  const hourlyRate = calculateHourlyRate(dailyRate);

  // Earnings
  const basicPay = round(basicSalary / 2, 2);
  const allowances = round(allowancesMonthly / 2, 2);
  const overtimePay = calculateOvertimePay(hourlyRate, otHours);
  const absencesDeduction = calculateAbsenceDeduction(dailyRate, unpaidDays);
  const minuteRate = round(hourlyRate / 60, 4);
  const tardinessDeduction = round(minuteRate * tardinessMinutes, 2);
  const totalAbsencesAndTardiness = round(absencesDeduction + tardinessDeduction, 2);

  const grossPay = round(basicPay + allowances + overtimePay + bonus - totalAbsencesAndTardiness, 2);

  // Mandatory Contributions
  const sss = calculateSssContribution(basicSalary);
  const philHealth = calculatePhilHealthContribution(basicSalary);
  const pagIbig = calculatePagIbigContribution(basicSalary);

  const totalMandatoryEmployee = round(
    sss.employeeShare + philHealth.employeeShare + pagIbig.employeeShare,
    2,
  );

  // Taxable Income = Gross Pay - Non-Taxable Allowances - Mandatory EE Contributions
  const taxableIncome = Math.max(0, round(grossPay - allowances - totalMandatoryEmployee, 2));
  const withholdingTax = calculateWithholdingTax(taxableIncome);

  const totalDeductions = round(
    totalMandatoryEmployee + withholdingTax + manualDeduction,
    2,
  );

  const netPay = round(grossPay - totalDeductions, 2);

  // Build itemized breakdown lines
  const lines: PayrollComputedLine[] = [
    {
      category: 'EARNING',
      code: 'BASIC',
      description: 'Semi-Monthly Basic Salary',
      amount: basicPay,
      rate: basicSalary,
      quantity: 0.5,
    },
  ];

  if (allowances > 0) {
    lines.push({
      category: 'EARNING',
      code: 'ALLOWANCE',
      description: 'De Minimis & Non-Taxable Allowances',
      amount: allowances,
      rate: allowancesMonthly,
      quantity: 0.5,
    });
  }

  if (overtimePay > 0) {
    lines.push({
      category: 'EARNING',
      code: 'OVERTIME',
      description: `Overtime (${otHours} hrs @ 1.25x)`,
      amount: overtimePay,
      rate: hourlyRate,
      quantity: otHours,
    });
  }

  if (bonus > 0) {
    lines.push({
      category: 'EARNING',
      code: 'BONUS',
      description: 'Performance Incentive / Special Bonus',
      amount: bonus,
    });
  }

  if (absencesDeduction > 0) {
    lines.push({
      category: 'DEDUCTION',
      code: 'ABSENCE',
      description: `Unpaid Absences / Leaves (${unpaidDays} day/s)`,
      amount: absencesDeduction,
      rate: dailyRate,
      quantity: unpaidDays,
    });
  }

  if (tardinessDeduction > 0) {
    lines.push({
      category: 'DEDUCTION',
      code: 'TARDINESS',
      description: `Tardiness & Undertime (${tardinessMinutes} mins)`,
      amount: tardinessDeduction,
      rate: round(hourlyRate / 60, 2),
      quantity: tardinessMinutes,
    });
  }

  lines.push(
    {
      category: 'DEDUCTION',
      code: 'SSS_EE',
      description: 'SSS Employee Contribution',
      amount: sss.employeeShare,
    },
    {
      category: 'DEDUCTION',
      code: 'PHILHEALTH_EE',
      description: 'PhilHealth Employee Contribution (5% rate)',
      amount: philHealth.employeeShare,
    },
    {
      category: 'DEDUCTION',
      code: 'PAGIBIG_EE',
      description: 'Pag-IBIG Employee Contribution (HDMF)',
      amount: pagIbig.employeeShare,
    },
    {
      category: 'DEDUCTION',
      code: 'WITHHOLDING_TAX',
      description: 'BIR Withholding Tax (TRAIN Law)',
      amount: withholdingTax,
    },
  );

  if (manualDeduction > 0) {
    lines.push({
      category: 'DEDUCTION',
      code: 'OTHER_DEDUCTION',
      description: 'Other Payroll Deductions / Loan Amortization',
      amount: manualDeduction,
    });
  }

  // Employer Contributions (Informational / Remittance)
  lines.push(
    {
      category: 'EMPLOYER_CONTRIBUTION',
      code: 'SSS_ER',
      description: 'SSS Employer Contribution Share',
      amount: sss.employerShare,
    },
    {
      category: 'EMPLOYER_CONTRIBUTION',
      code: 'PHILHEALTH_ER',
      description: 'PhilHealth Employer Contribution Share',
      amount: philHealth.employerShare,
    },
    {
      category: 'EMPLOYER_CONTRIBUTION',
      code: 'PAGIBIG_ER',
      description: 'Pag-IBIG Employer Contribution Share',
      amount: pagIbig.employerShare,
    },
  );

  return {
    dailyRate,
    hourlyRate,
    basicPay,
    allowances,
    overtimePay,
    absencesDeduction: totalAbsencesAndTardiness,
    bonus,
    grossPay,
    sssEe: sss.employeeShare,
    sssEr: sss.employerShare,
    philHealthEe: philHealth.employeeShare,
    philHealthEr: philHealth.employerShare,
    pagIbigEe: pagIbig.employeeShare,
    pagIbigEr: pagIbig.employerShare,
    taxableIncome,
    withholdingTax,
    manualDeduction,
    totalDeductions,
    netPay,
    lines,
  };
}
