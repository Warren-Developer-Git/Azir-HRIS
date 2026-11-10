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
        hireDate: new Date('2024-01-01'),
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
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
  });

  return { acme, depthead, admin, hr, hr2, manager, employee, dev1 };
}
