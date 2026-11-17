import { PrismaClient, Role, Gender, MaritalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  todayInManila,
  isEligibleForGrant,
  countLeaveDays,
} from '../src/leave/leave-rules.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.OWNER_DATABASE_URL ||
        'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms',
    },
  },
});

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  console.log('Seeding HRMS database as owner...');
  const today = todayInManila();
  const currentYear = parseInt(today.split('-')[0], 10);
  const passwordHash = bcrypt.hashSync('Demo1234!', 10);

  // Clean existing data
  await prisma.$executeRawUnsafe(`TRUNCATE "Tenant" CASCADE;`);

  // ==========================================
  // TENANT 1: Azir Company Global Tech
  // ==========================================
  const acme = await prisma.tenant.create({
    data: { name: 'Azir Company Global Tech' },
  });

  // Acme Departments
  const acmeEng = await prisma.department.create({
    data: { tenantId: acme.id, name: 'Engineering' },
  });
  const acmeOps = await prisma.department.create({
    data: { tenantId: acme.id, name: 'Operations' },
  });
  const acmeHrDept = await prisma.department.create({
    data: { tenantId: acme.id, name: 'Human Resources' },
  });

  // Acme Leave Types (Philippine Preset)
  const acmeLeaveTypes = [
    {
      code: 'SIL',
      name: 'Service Incentive Leave',
      kind: 'YEARLY' as const,
      defaultDays: 5,
      countingMode: 'WORKING_DAYS' as const,
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 12,
      requiresAttachment: false,
    },
    {
      code: 'VL',
      name: 'Vacation Leave',
      kind: 'YEARLY' as const,
      defaultDays: 10,
      countingMode: 'WORKING_DAYS' as const,
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
      requiresAttachment: false,
    },
    {
      code: 'SL',
      name: 'Sick Leave',
      kind: 'YEARLY' as const,
      defaultDays: 10,
      countingMode: 'WORKING_DAYS' as const,
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
      requiresAttachment: false,
    },
    {
      code: 'MAT',
      name: 'Maternity Leave',
      kind: 'PER_EVENT' as const,
      defaultDays: 105,
      countingMode: 'CALENDAR_DAYS' as const,
      eligibleGender: 'FEMALE' as const,
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
      requiresAttachment: true,
    },
    {
      code: 'PAT',
      name: 'Paternity Leave',
      kind: 'PER_EVENT' as const,
      defaultDays: 7,
      countingMode: 'WORKING_DAYS' as const,
      eligibleGender: 'MALE' as const,
      eligibleMaritalStatus: 'MARRIED' as const,
      minServiceMonths: 0,
      requiresAttachment: false,
    },
  ];

  const acmeTypesMap = new Map<string, any>();
  for (const lt of acmeLeaveTypes) {
    const created = await prisma.leaveType.create({
      data: { tenantId: acme.id, ...lt },
    });
    acmeTypesMap.set(lt.code, created);
  }

  // Acme Holidays (2026 Philippine Proclamation)
  const phHolidays = [
    { date: '2026-01-01', name: "New Year's Day", type: 'REGULAR' as const },
    { date: '2026-04-09', name: 'Araw ng Kagitingan', type: 'REGULAR' as const },
    { date: '2026-05-01', name: 'Labor Day', type: 'REGULAR' as const },
    { date: '2026-06-12', name: 'Independence Day', type: 'REGULAR' as const },
    { date: '2026-08-31', name: 'National Heroes Day', type: 'REGULAR' as const },
    { date: '2026-11-30', name: 'Bonifacio Day', type: 'REGULAR' as const },
    { date: '2026-12-08', name: 'Feast of the Immaculate Conception', type: 'SPECIAL' as const },
    { date: '2026-12-24', name: 'Christmas Eve', type: 'SPECIAL' as const },
    { date: '2026-12-25', name: 'Christmas Day', type: 'REGULAR' as const },
    { date: '2026-12-30', name: 'Rizal Day', type: 'REGULAR' as const },
    { date: '2026-12-31', name: 'Last Day of the Year', type: 'SPECIAL' as const },
  ];

  for (const h of phHolidays) {
    await prisma.holiday.create({
      data: {
        tenantId: acme.id,
        date: new Date(h.date),
        name: h.name,
        type: h.type,
      },
    });
  }

  // Document Types Preset
  const defaultDocTypes = [
    {
      code: 'COE' as const,
      name: 'Certificate of Employment',
      description: 'Standard certification of employment status, position, and tenure.',
      requiresApproval: true,
      includesSalary: false,
      slaDays: 3,
    },
    {
      code: 'COE_COMPENSATION' as const,
      name: 'Certificate of Employment with Compensation',
      description: 'Employment certificate including monthly basic salary and allowances.',
      requiresApproval: true,
      includesSalary: true,
      slaDays: 3,
    },
    {
      code: 'LEAVE_CERT' as const,
      name: 'Leave Balance Certification',
      description: 'Official certified statement of accrued, used, and available leave credits.',
      requiresApproval: true,
      includesSalary: false,
      slaDays: 3,
    },
    {
      code: 'PAYSLIP' as const,
      name: 'Official Certified Payslip',
      description: 'Certified payslip copy for bank, visa, or loan application purposes.',
      requiresApproval: true,
      includesSalary: true,
      slaDays: 3,
    },
  ];

  for (const doc of defaultDocTypes) {
    await prisma.documentType.create({
      data: {
        tenantId: acme.id,
        ...doc,
      },
    });
  }

  // Helper to create User + Employee
  async function createEmp(tenantId: string, data: {
    email: string;
    roles: Role[];
    employeeNo: string;
    firstName: string;
    lastName: string;
    departmentId?: string;
    position: string;
    managerId?: string;
    hireDate: string;
    gender: Gender;
    maritalStatus: MaritalStatus;
    basicSalary?: number;
    allowances?: number;
  }) {
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        roles: data.roles,
        active: true,
      },
    });

    const emp = await prisma.employee.create({
      data: {
        tenantId,
        userId: user.id,
        employeeNo: data.employeeNo,
        firstName: data.firstName,
        lastName: data.lastName,
        departmentId: data.departmentId,
        position: data.position,
        managerId: data.managerId,
        hireDate: new Date(data.hireDate),
        gender: data.gender,
        maritalStatus: data.maritalStatus,
        basicSalary: data.basicSalary ?? 35000.00,
        allowances: data.allowances ?? 2500.00,
      },
    });

    return { user, emp };
  }

  // 1. Acme Dept Head (No manager)
  const depthead = await createEmp(acme.id, {
    email: 'depthead@acgt.test',
    roles: ['MANAGER', 'EMPLOYEE'],
    employeeNo: 'ACGT-001',
    firstName: 'Eduardo',
    lastName: 'Santos',
    departmentId: acmeOps.id,
    position: 'VP of Operations',
    hireDate: '2022-01-15',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  // 2. Admin (reports to depthead)
  const admin = await createEmp(acme.id, {
    email: 'admin@acgt.test',
    roles: ['ADMIN', 'EMPLOYEE'],
    employeeNo: 'ACGT-002',
    firstName: 'Alejandro',
    lastName: 'Reyes',
    departmentId: acmeEng.id,
    position: 'IT Systems Admin',
    managerId: depthead.emp.id,
    hireDate: '2023-01-10',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  // 3. HR 1 (reports to depthead)
  const hr = await createEmp(acme.id, {
    email: 'hr@acgt.test',
    roles: ['HR', 'EMPLOYEE'],
    employeeNo: 'ACGT-003',
    firstName: 'Maria',
    lastName: 'Clara',
    departmentId: acmeHrDept.id,
    position: 'HR Lead',
    managerId: depthead.emp.id,
    hireDate: '2023-02-01',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
  });

  // 4. HR 2 (reports to depthead)
  const hr2 = await createEmp(acme.id, {
    email: 'hr2@acgt.test',
    roles: ['HR', 'EMPLOYEE'],
    employeeNo: 'ACGT-004',
    firstName: 'Corazon',
    lastName: 'Aquino',
    departmentId: acmeHrDept.id,
    position: 'HR Officer',
    managerId: depthead.emp.id,
    hireDate: '2024-03-01',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
  });

  // 5. Manager (reports to depthead)
  const manager = await createEmp(acme.id, {
    email: 'manager@acgt.test',
    roles: ['MANAGER', 'EMPLOYEE'],
    employeeNo: 'ACGT-005',
    firstName: 'Manuel',
    lastName: 'Quezon',
    departmentId: acmeEng.id,
    position: 'Engineering Manager',
    managerId: depthead.emp.id,
    hireDate: '2024-01-15',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
  });

  // 6. Employee (reports to manager)
  const employee = await createEmp(acme.id, {
    email: 'employee@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-006',
    firstName: 'Gabriela',
    lastName: 'Silang',
    departmentId: acmeEng.id,
    position: 'Senior Software Engineer',
    managerId: manager.emp.id,
    hireDate: '2024-06-01',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
  });

  // 7. Dev 1 (reports to manager)
  const dev1 = await createEmp(acme.id, {
    email: 'dev1@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-007',
    firstName: 'Jose',
    lastName: 'Rizal',
    departmentId: acmeEng.id,
    position: 'Software Engineer',
    managerId: manager.emp.id,
    hireDate: '2025-01-10',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  // 8. Dev 2 (reports to manager)
  const dev2 = await createEmp(acme.id, {
    email: 'dev2@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-008',
    firstName: 'Teresa',
    lastName: 'Magbanua',
    departmentId: acmeEng.id,
    position: 'QA Engineer',
    managerId: manager.emp.id,
    hireDate: '2025-02-15',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
  });

  // 9. Ops 1 (reports to manager)
  const ops1 = await createEmp(acme.id, {
    email: 'ops1@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-009',
    firstName: 'Andres',
    lastName: 'Bonifacio',
    departmentId: acmeEng.id,
    position: 'DevOps Engineer',
    managerId: manager.emp.id,
    hireDate: '2025-05-10',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
  });

  // 10. Designer (reports to manager)
  const designer = await createEmp(acme.id, {
    email: 'designer@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-010',
    firstName: 'Melchora',
    lastName: 'Aquino',
    departmentId: acmeEng.id,
    position: 'UI/UX Designer',
    managerId: manager.emp.id,
    hireDate: '2025-04-01',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
  });

  // 11. Analyst (reports to manager)
  const analyst = await createEmp(acme.id, {
    email: 'analyst@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-011',
    firstName: 'Apolinario',
    lastName: 'Mabini',
    departmentId: acmeEng.id,
    position: 'Systems Analyst',
    managerId: manager.emp.id,
    hireDate: '2025-05-01',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
  });

  // 12. Newhire (hired 3 months ago, reports to depthead)
  const threeMonthsAgo = addDays(today, -90);
  const newhire = await createEmp(acme.id, {
    email: 'newhire@acgt.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACGT-012',
    firstName: 'Juan',
    lastName: 'Luna',
    departmentId: acmeOps.id,
    position: 'Junior Associate',
    managerId: depthead.emp.id,
    hireDate: threeMonthsAgo,
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  const acmeEmployees = [
    depthead,
    admin,
    hr,
    hr2,
    manager,
    employee,
    dev1,
    dev2,
    ops1,
    designer,
    analyst,
    newhire,
  ];

  // Grant annual balances for Acme employees for current year
  for (const { emp } of acmeEmployees) {
    const hireDateStr = emp.hireDate.toISOString().slice(0, 10);
    for (const lt of acmeLeaveTypes) {
      if (
        lt.kind === 'YEARLY' &&
        isEligibleForGrant(lt as any, { hireDate: hireDateStr }, today)
      ) {
        const typeRecord = acmeTypesMap.get(lt.code);
        await prisma.leaveLedgerEntry.create({
          data: {
            tenantId: acme.id,
            employeeId: emp.id,
            leaveTypeId: typeRecord.id,
            year: currentYear,
            type: 'GRANT',
            days: lt.defaultDays,
            reason: `Annual Grant ${currentYear}`,
            createdById: hr.user.id,
          },
        });
      }
    }
  }

  // Seed Leave Requests for Acme in various statuses
  // 1. PENDING_MANAGER (Employee)
  const start1 = addDays(today, 7);
  const end1 = addDays(today, 8);
  await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: employee.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      startDate: new Date(start1),
      endDate: new Date(end1),
      days: 2,
      reason: 'Family event in the province',
      status: 'PENDING_MANAGER',
    },
  });

  // 2. PENDING_MANAGER (Dev 1)
  const start2 = addDays(today, 10);
  await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: dev1.emp.id,
      leaveTypeId: acmeTypesMap.get('SL').id,
      startDate: new Date(start2),
      endDate: new Date(start2),
      days: 1,
      reason: 'Scheduled medical appointment',
      status: 'PENDING_MANAGER',
    },
  });

  // 3. PENDING_HR (Dev 2 - Manager approved)
  const start3 = addDays(today, 14);
  const end3 = addDays(today, 16);
  const req3 = await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: dev2.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      startDate: new Date(start3),
      endDate: new Date(end3),
      days: 3,
      reason: 'Personal matters and rest',
      status: 'PENDING_HR',
    },
  });
  await prisma.leaveApproval.create({
    data: {
      tenantId: acme.id,
      requestId: req3.id,
      step: 'MANAGER',
      approverId: manager.emp.id,
      decision: 'APPROVED',
      comment: 'Covered by team members',
    },
  });

  // 4. APPROVED (Ops 1 - Manager & HR approved, DEDUCT ledger created)
  const start4 = addDays(today, 20);
  const end4 = addDays(today, 21);
  const req4 = await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: ops1.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      startDate: new Date(start4),
      endDate: new Date(end4),
      days: 2,
      reason: 'Out of town trip',
      status: 'APPROVED',
    },
  });
  await prisma.leaveApproval.createMany({
    data: [
      {
        tenantId: acme.id,
        requestId: req4.id,
        step: 'MANAGER',
        approverId: manager.emp.id,
        decision: 'APPROVED',
        comment: 'Approved by manager',
      },
      {
        tenantId: acme.id,
        requestId: req4.id,
        step: 'HR',
        approverId: hr.emp.id,
        decision: 'APPROVED',
        comment: 'Policy verified by HR',
      },
    ],
  });
  await prisma.leaveLedgerEntry.create({
    data: {
      tenantId: acme.id,
      employeeId: ops1.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      year: currentYear,
      type: 'DEDUCT',
      days: -2,
      reason: `Leave Request Deduction`,
      requestId: req4.id,
      createdById: hr.user.id,
    },
  });

  // 5. APPROVED (Designer - SIL approved)
  const start5 = addDays(today, 25);
  const req5 = await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: designer.emp.id,
      leaveTypeId: acmeTypesMap.get('SIL').id,
      startDate: new Date(start5),
      endDate: new Date(start5),
      days: 1,
      reason: 'Service incentive day',
      status: 'APPROVED',
    },
  });
  await prisma.leaveApproval.createMany({
    data: [
      {
        tenantId: acme.id,
        requestId: req5.id,
        step: 'MANAGER',
        approverId: manager.emp.id,
        decision: 'APPROVED',
      },
      {
        tenantId: acme.id,
        requestId: req5.id,
        step: 'HR',
        approverId: hr.emp.id,
        decision: 'APPROVED',
      },
    ],
  });
  await prisma.leaveLedgerEntry.create({
    data: {
      tenantId: acme.id,
      employeeId: designer.emp.id,
      leaveTypeId: acmeTypesMap.get('SIL').id,
      year: currentYear,
      type: 'DEDUCT',
      days: -1,
      reason: `Leave Request Deduction`,
      requestId: req5.id,
      createdById: hr.user.id,
    },
  });

  // 6. REJECTED (Analyst)
  const start6 = addDays(today, 12);
  const end6 = addDays(today, 15);
  const req6 = await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: analyst.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      startDate: new Date(start6),
      endDate: new Date(end6),
      days: 4,
      reason: 'Vacation',
      status: 'REJECTED',
    },
  });
  await prisma.leaveApproval.create({
    data: {
      tenantId: acme.id,
      requestId: req6.id,
      step: 'MANAGER',
      approverId: manager.emp.id,
      decision: 'REJECTED',
      comment: 'Sprint release week, unable to approve long absence',
    },
  });

  // 7. CANCELLED (Employee)
  const start7 = addDays(today, 18);
  await prisma.leaveRequest.create({
    data: {
      tenantId: acme.id,
      employeeId: employee.emp.id,
      leaveTypeId: acmeTypesMap.get('VL').id,
      startDate: new Date(start7),
      endDate: new Date(start7),
      days: 1,
      reason: 'Errands (plans changed)',
      status: 'CANCELLED',
    },
  });

  // ==========================================
  // TENANT 2: BAYANIHAN FOODS INC
  // ==========================================
  const bayanihan = await prisma.tenant.create({
    data: { name: 'Bayanihan Foods Inc' },
  });

  const bynMgmt = await prisma.department.create({
    data: { tenantId: bayanihan.id, name: 'Management' },
  });
  const bynKitchen = await prisma.department.create({
    data: { tenantId: bayanihan.id, name: 'Kitchen' },
  });
  const bynService = await prisma.department.create({
    data: { tenantId: bayanihan.id, name: 'Service' },
  });

  // Bayanihan Leave Types
  const bynTypesMap = new Map<string, any>();
  for (const lt of acmeLeaveTypes) {
    const created = await prisma.leaveType.create({
      data: { tenantId: bayanihan.id, ...lt },
    });
    bynTypesMap.set(lt.code, created);
  }

  // Bayanihan Holidays
  for (const h of phHolidays) {
    await prisma.holiday.create({
      data: {
        tenantId: bayanihan.id,
        date: new Date(h.date),
        name: h.name,
        type: h.type,
      },
    });
  }

  for (const doc of defaultDocTypes) {
    await prisma.documentType.create({
      data: {
        tenantId: bayanihan.id,
        ...doc,
      },
    });
  }

  // Bayanihan Employees (5 total)
  const bynAdmin = await createEmp(bayanihan.id, {
    email: 'admin@bayanihan.test',
    roles: ['ADMIN', 'EMPLOYEE'],
    employeeNo: 'BYN-001',
    firstName: 'Benigno',
    lastName: 'Aquino',
    departmentId: bynMgmt.id,
    position: 'Branch Administrator',
    hireDate: '2023-01-01',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  const bynHr = await createEmp(bayanihan.id, {
    email: 'hr@bayanihan.test',
    roles: ['HR', 'EMPLOYEE'],
    employeeNo: 'BYN-002',
    firstName: 'Imelda',
    lastName: 'Marcos',
    departmentId: bynMgmt.id,
    position: 'HR Administrator',
    hireDate: '2023-03-01',
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
  });

  const bynManager = await createEmp(bayanihan.id, {
    email: 'manager@bayanihan.test',
    roles: ['MANAGER', 'EMPLOYEE'],
    employeeNo: 'BYN-003',
    firstName: 'Ferdinand',
    lastName: 'Marcos',
    departmentId: bynKitchen.id,
    position: 'Kitchen Manager',
    hireDate: '2023-06-01',
    gender: 'MALE',
    maritalStatus: 'MARRIED',
  });

  const bynEmployee = await createEmp(bayanihan.id, {
    email: 'employee@bayanihan.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'BYN-004',
    firstName: 'Rodrigo',
    lastName: 'Duterte',
    departmentId: bynKitchen.id,
    position: 'Line Cook',
    managerId: bynManager.emp.id,
    hireDate: '2024-01-10',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  const bynStaff = await createEmp(bayanihan.id, {
    email: 'staff@bayanihan.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'BYN-005',
    firstName: 'Sara',
    lastName: 'Duterte',
    departmentId: bynService.id,
    position: 'Service Crew',
    managerId: bynManager.emp.id,
    hireDate: '2024-02-01',
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
  });

  // Grants for Bayanihan
  for (const { emp } of [bynAdmin, bynHr, bynManager, bynEmployee, bynStaff]) {
    const hireDateStr = emp.hireDate.toISOString().slice(0, 10);
    for (const lt of acmeLeaveTypes) {
      if (
        lt.kind === 'YEARLY' &&
        isEligibleForGrant(lt as any, { hireDate: hireDateStr }, today)
      ) {
        const typeRecord = bynTypesMap.get(lt.code);
        await prisma.leaveLedgerEntry.create({
          data: {
            tenantId: bayanihan.id,
            employeeId: emp.id,
            leaveTypeId: typeRecord.id,
            year: currentYear,
            type: 'GRANT',
            days: lt.defaultDays,
            reason: `Annual Grant ${currentYear}`,
            createdById: bynHr.user.id,
          },
        });
      }
    }
  }

  // Seed Payroll Periods for Acme
  await prisma.payrollPeriod.createMany({
    data: [
      {
        tenantId: acme.id,
        name: 'October 2026 - Second Half',
        cutoffType: 'SECOND_HALF',
        startDate: new Date('2026-10-16'),
        endDate: new Date('2026-10-31'),
        payDate: new Date('2026-10-31'),
        workingDays: 11,
      },
      {
        tenantId: acme.id,
        name: 'November 2026 - First Half',
        cutoffType: 'FIRST_HALF',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-15'),
        payDate: new Date('2026-11-15'),
        workingDays: 10,
      },
      {
        tenantId: acme.id,
        name: 'November 2026 - Second Half',
        cutoffType: 'SECOND_HALF',
        startDate: new Date('2026-11-16'),
        endDate: new Date('2026-11-30'),
        payDate: new Date('2026-11-30'),
        workingDays: 10,
      },
    ],
  });

  // Seed Payroll Periods for Bayanihan
  await prisma.payrollPeriod.createMany({
    data: [
      {
        tenantId: bayanihan.id,
        name: 'November 2026 - First Half',
        cutoffType: 'FIRST_HALF',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-15'),
        payDate: new Date('2026-11-15'),
        workingDays: 10,
      },
      {
        tenantId: bayanihan.id,
        name: 'November 2026 - Second Half',
        cutoffType: 'SECOND_HALF',
        startDate: new Date('2026-11-16'),
        endDate: new Date('2026-11-30'),
        payDate: new Date('2026-11-30'),
        workingDays: 10,
      },
    ],
  });

  // Seed Sample Attendance Records for Acme (Nov 2026 - Asia/Manila UTC+8: 09:00 PHT = 01:00 UTC, 18:00 PHT = 10:00 UTC)
  await prisma.attendanceRecord.createMany({
    data: [
      // Gabriela Silang (employee@acgt.test)
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-03T00:00:00.000Z'),
        timeIn: new Date('2026-11-03T00:55:00.000Z'), // 08:55 AM PHT
        timeOut: new Date('2026-11-03T10:05:00.000Z'), // 06:05 PM PHT
        locationType: 'OFFICE',
        source: 'WEB_PUNCH',
        status: 'PRESENT',
        lateMinutes: 0,
        undertimeMinutes: 0,
        notes: 'On time at Makati HQ',
      },
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-04T00:00:00.000Z'),
        timeIn: new Date('2026-11-04T01:35:00.000Z'), // 09:35 AM PHT (35 mins late)
        timeOut: new Date('2026-11-04T10:02:00.000Z'), // 06:02 PM PHT
        locationType: 'OFFICE',
        source: 'WEB_PUNCH',
        status: 'LATE',
        lateMinutes: 35,
        undertimeMinutes: 0,
        notes: 'Heavy EDSA traffic',
      },
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-05T00:00:00.000Z'),
        timeIn: new Date('2026-11-05T01:08:00.000Z'), // 09:08 AM PHT (within 15m grace)
        timeOut: new Date('2026-11-05T10:15:00.000Z'), // 06:15 PM PHT
        locationType: 'OFFICE',
        source: 'WEB_PUNCH',
        status: 'PRESENT',
        lateMinutes: 0,
        undertimeMinutes: 0,
        notes: 'Within grace period',
      },
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-06T00:00:00.000Z'),
        locationType: 'FIELD_CLIENT_SITE',
        source: 'CORRECTION_OB',
        status: 'OFFICIAL_BUSINESS',
        lateMinutes: 0,
        undertimeMinutes: 0,
        notes: 'OB: BGC Corporate Tower - ERP client deployment & UAT (Note: Approved field pass)',
      },
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-11T00:00:00.000Z'),
        timeIn: new Date('2026-11-11T00:58:00.000Z'), // 08:58 AM PHT
        timeOut: new Date('2026-11-11T10:00:00.000Z'), // 06:00 PM PHT
        locationType: 'REMOTE_WFH',
        source: 'WEB_PUNCH',
        status: 'PRESENT',
        lateMinutes: 0,
        undertimeMinutes: 0,
        notes: 'Approved WFH sprint focus day',
      },
      // Jose Rizal (dev1@acgt.test)
      {
        tenantId: acme.id,
        employeeId: dev1.emp.id,
        date: new Date('2026-11-11T00:00:00.000Z'),
        timeIn: new Date('2026-11-11T01:02:00.000Z'),
        timeOut: new Date('2026-11-11T10:10:00.000Z'),
        locationType: 'OFFICE',
        source: 'WEB_PUNCH',
        status: 'PRESENT',
        lateMinutes: 0,
        undertimeMinutes: 0,
      },
      // Teresa Magbanua (dev2@acgt.test)
      {
        tenantId: acme.id,
        employeeId: dev2.emp.id,
        date: new Date('2026-11-11T00:00:00.000Z'),
        timeIn: new Date('2026-11-11T01:22:00.000Z'), // 09:22 AM PHT
        timeOut: new Date('2026-11-11T10:00:00.000Z'),
        locationType: 'OFFICE',
        source: 'WEB_PUNCH',
        status: 'LATE',
        lateMinutes: 22,
        undertimeMinutes: 0,
      },
    ],
  });

  // Seed Official Business (OB) & Missed Punch Correction Requests for Acme
  await prisma.attendanceCorrectionRequest.createMany({
    data: [
      {
        tenantId: acme.id,
        employeeId: employee.emp.id,
        date: new Date('2026-11-06T00:00:00.000Z'),
        type: 'OFFICIAL_BUSINESS',
        locationType: 'FIELD_CLIENT_SITE',
        destination: 'BGC Corporate Tower, Taguig',
        reason: 'Full-day ERP client deployment & stakeholder UAT session',
        status: 'APPROVED',
        decidedById: manager.emp.id,
        decidedAt: new Date('2026-11-06T02:00:00.000Z'),
        decisionNote: 'Approved field pass',
      },
      {
        tenantId: acme.id,
        employeeId: dev1.emp.id,
        date: new Date('2026-11-13T00:00:00.000Z'),
        type: 'OFFICIAL_BUSINESS',
        locationType: 'FIELD_CLIENT_SITE',
        destination: 'Ortigas Center Data Facility',
        reason: 'On-site database server migration and security audit with client IT',
        status: 'PENDING',
      },
      {
        tenantId: acme.id,
        employeeId: dev2.emp.id,
        date: new Date('2026-11-12T00:00:00.000Z'),
        type: 'MISSED_PUNCH',
        proposedTimeIn: new Date('2026-11-12T00:57:00.000Z'),
        proposedTimeOut: new Date('2026-11-12T10:04:00.000Z'),
        locationType: 'OFFICE',
        reason: 'Lobby turnstile scanner was offline during morning rush; attended 9:00 AM QA standup',
        status: 'PENDING',
      },
    ],
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
