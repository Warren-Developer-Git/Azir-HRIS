import { PrismaClient, Role, Gender, MaritalStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.js';
import bcrypt from 'bcryptjs';

const TEST_APP_URL =
  process.env.TEST_APP_DATABASE_URL ||
  'postgresql://hrms_app:hrms_app_dev@localhost:5432/hrms_test';
const TEST_OWNER_URL =
  process.env.TEST_OWNER_DATABASE_URL ||
  'postgresql://hrms_owner:hrms_owner_dev@localhost:5432/hrms_test';

export function createOwnerPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: TEST_OWNER_URL },
    },
  });
}

export function createAppPrisma(): PrismaService {
  return new PrismaService({
    datasources: {
      db: { url: TEST_APP_URL },
    },
  });
}

export async function resetAndSeedTestDb(ownerDb: PrismaClient) {
  await ownerDb.$executeRawUnsafe(`TRUNCATE "Tenant" CASCADE;`);
  const passwordHash = bcrypt.hashSync('Demo1234!', 10);

  // Tenant Acme
  const acme = await ownerDb.tenant.create({ data: { name: 'Acme Manila Corp' } });
  const acmeEng = await ownerDb.department.create({ data: { tenantId: acme.id, name: 'Engineering' } });
  const acmeHr = await ownerDb.department.create({ data: { tenantId: acme.id, name: 'Human Resources' } });

  // Leave Types for Acme
  const sil = await ownerDb.leaveType.create({
    data: {
      tenantId: acme.id,
      code: 'SIL',
      name: 'Service Incentive Leave',
      kind: 'YEARLY',
      defaultDays: 5,
      countingMode: 'WORKING_DAYS',
      minServiceMonths: 12,
    },
  });

  const vl = await ownerDb.leaveType.create({
    data: {
      tenantId: acme.id,
      code: 'VL',
      name: 'Vacation Leave',
      kind: 'YEARLY',
      defaultDays: 10,
      countingMode: 'WORKING_DAYS',
      minServiceMonths: 0,
    },
  });

  const sl = await ownerDb.leaveType.create({
    data: {
      tenantId: acme.id,
      code: 'SL',
      name: 'Sick Leave',
      kind: 'YEARLY',
      defaultDays: 10,
      countingMode: 'WORKING_DAYS',
      minServiceMonths: 0,
    },
  });

  const mat = await ownerDb.leaveType.create({
    data: {
      tenantId: acme.id,
      code: 'MAT',
      name: 'Maternity Leave',
      kind: 'PER_EVENT',
      defaultDays: 105,
      countingMode: 'CALENDAR_DAYS',
      eligibleGender: 'FEMALE',
      minServiceMonths: 0,
    },
  });

  const pat = await ownerDb.leaveType.create({
    data: {
      tenantId: acme.id,
      code: 'PAT',
      name: 'Paternity Leave',
      kind: 'PER_EVENT',
      defaultDays: 7,
      countingMode: 'WORKING_DAYS',
      eligibleGender: 'MALE',
      eligibleMaritalStatus: 'MARRIED',
      minServiceMonths: 0,
    },
  });

  // Holidays
  await ownerDb.holiday.createMany({
    data: [
      { tenantId: acme.id, date: new Date('2026-01-01'), name: "New Year's Day", type: 'REGULAR' },
      { tenantId: acme.id, date: new Date('2026-11-30'), name: 'Bonifacio Day', type: 'REGULAR' },
      { tenantId: acme.id, date: new Date('2026-12-25'), name: 'Christmas Day', type: 'REGULAR' },
      { tenantId: acme.id, date: new Date('2026-12-30'), name: 'Rizal Day', type: 'REGULAR' },
    ],
  });

  // Users & Employees
  async function addEmp(data: {
    email: string;
    roles: Role[];
    employeeNo: string;
    firstName: string;
    lastName: string;
    departmentId?: string;
    position: string;
    managerId?: string;
    gender?: Gender;
    maritalStatus?: MaritalStatus;
    hireDate?: string;
  }) {
    const user = await ownerDb.user.create({
      data: {
        tenantId: acme.id,
        email: data.email,
        passwordHash,
        roles: data.roles,
        active: true,
      },
    });
    const emp = await ownerDb.employee.create({
      data: {
        tenantId: acme.id,
        userId: user.id,
        employeeNo: data.employeeNo,
        firstName: data.firstName,
        lastName: data.lastName,
        departmentId: data.departmentId,
        position: data.position,
        managerId: data.managerId,
        hireDate: new Date(data.hireDate ?? '2024-01-01'),
        gender: data.gender ?? 'FEMALE',
        maritalStatus: data.maritalStatus ?? 'SINGLE',
      },
    });
    return { user, emp };
  }

  const depthead = await addEmp({
    email: 'depthead@acme.test',
    roles: ['MANAGER', 'EMPLOYEE'],
    employeeNo: 'ACM-001',
    firstName: 'Eduardo',
    lastName: 'Santos',
    departmentId: acmeEng.id,
    position: 'VP',
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  const admin = await addEmp({
    email: 'admin@acme.test',
    roles: ['ADMIN', 'EMPLOYEE'],
    employeeNo: 'ACM-002',
    firstName: 'Alejandro',
    lastName: 'Reyes',
    departmentId: acmeEng.id,
    position: 'Admin',
    managerId: depthead.emp.id,
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  const hr = await addEmp({
    email: 'hr@acme.test',
    roles: ['HR', 'EMPLOYEE'],
    employeeNo: 'ACM-003',
    firstName: 'Maria',
    lastName: 'Clara',
    departmentId: acmeHr.id,
    position: 'HR Lead',
    managerId: depthead.emp.id,
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
  });

  const hr2 = await addEmp({
    email: 'hr2@acme.test',
    roles: ['HR', 'EMPLOYEE'],
    employeeNo: 'ACM-004',
    firstName: 'Corazon',
    lastName: 'Aquino',
    departmentId: acmeHr.id,
    position: 'HR Officer',
    managerId: depthead.emp.id,
    gender: 'FEMALE',
    maritalStatus: 'SINGLE',
  });

  const manager = await addEmp({
    email: 'manager@acme.test',
    roles: ['MANAGER', 'EMPLOYEE'],
    employeeNo: 'ACM-005',
    firstName: 'Manuel',
    lastName: 'Quezon',
    departmentId: acmeEng.id,
    position: 'Manager',
    managerId: depthead.emp.id,
    gender: 'MALE',
    maritalStatus: 'MARRIED',
  });

  const employee = await addEmp({
    email: 'employee@acme.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACM-006',
    firstName: 'Gabriela',
    lastName: 'Silang',
    departmentId: acmeEng.id,
    position: 'Engineer',
    managerId: manager.emp.id,
    gender: 'FEMALE',
    maritalStatus: 'MARRIED',
  });

  const dev1 = await addEmp({
    email: 'dev1@acme.test',
    roles: ['EMPLOYEE'],
    employeeNo: 'ACM-007',
    firstName: 'Jose',
    lastName: 'Rizal',
    departmentId: acmeEng.id,
    position: 'Dev',
    managerId: manager.emp.id,
    gender: 'MALE',
    maritalStatus: 'SINGLE',
  });

  // Tenant 2: Bayanihan Foods
  const bayanihan = await ownerDb.tenant.create({ data: { name: 'Bayanihan Foods' } });
  const bynEmployee = await ownerDb.user.create({
    data: {
      tenantId: bayanihan.id,
      email: 'employee@bayanihan.test',
      passwordHash,
      roles: ['EMPLOYEE'],
    },
  });
  await ownerDb.employee.create({
    data: {
      tenantId: bayanihan.id,
      userId: bynEmployee.id,
      employeeNo: 'BYN-001',
      firstName: 'Rodrigo',
      lastName: 'Duterte',
      position: 'Cook',
      hireDate: new Date('2024-01-01'),
      gender: 'MALE',
      maritalStatus: 'SINGLE',
    },
  });

  const bynHr = await ownerDb.user.create({
    data: {
      tenantId: bayanihan.id,
      email: 'hr@bayanihan.test',
      passwordHash,
      roles: ['HR', 'EMPLOYEE'],
    },
  });
  await ownerDb.employee.create({
    data: {
      tenantId: bayanihan.id,
      userId: bynHr.id,
      employeeNo: 'BYN-002',
      firstName: 'Leni',
      lastName: 'Robredo',
      position: 'HR Officer',
      hireDate: new Date('2024-01-01'),
      gender: 'FEMALE',
      maritalStatus: 'SINGLE',
    },
  });

  // Annual Grants for Acme
  for (const empRecord of [depthead, admin, hr, hr2, manager, employee, dev1]) {
    await ownerDb.leaveLedgerEntry.createMany({
      data: [
        {
          tenantId: acme.id,
          employeeId: empRecord.emp.id,
          leaveTypeId: vl.id,
          year: 2026,
          type: 'GRANT',
          days: 10,
          createdById: hr.user.id,
        },
        {
          tenantId: acme.id,
          employeeId: empRecord.emp.id,
          leaveTypeId: sl.id,
          year: 2026,
          type: 'GRANT',
          days: 10,
          createdById: hr.user.id,
        },
        {
          tenantId: acme.id,
          employeeId: empRecord.emp.id,
          leaveTypeId: sil.id,
          year: 2026,
          type: 'GRANT',
          days: 5,
          createdById: hr.user.id,
        },
      ],
    });
  }

  return {
    acme,
    depthead,
    admin,
    hr,
    hr2,
    manager,
    employee,
    dev1,
    leaveTypes: { sil, vl, sl, mat, pat },
  };
}
