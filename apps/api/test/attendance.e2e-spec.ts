import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Daily Time Records (DTR), OB & Attendance Flow (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let employeeToken: string;
  let managerToken: string;
  let hrToken: string;
  let adminToken: string;
  let globexToken: string;
  let employeeId: string;
  let globexTenantId: string;

  beforeAll(async () => {
    ownerDb = createOwnerPrisma();
    await resetAndSeedTestDb(ownerDb);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    async function getToken(email: string) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Demo1234!' });
      return res.body.accessToken;
    }

    employeeToken = await getToken('employee@acgt.test');
    managerToken = await getToken('manager@acgt.test');
    hrToken = await getToken('hr@acgt.test');
    adminToken = await getToken('admin@acgt.test');

    const empUser = await ownerDb.user.findUnique({
      where: { email: 'employee@acgt.test' },
      include: { employee: true },
    });
    employeeId = empUser!.employee!.id;

    // Create a Globex user for cross-tenant testing
    const globex = await ownerDb.tenant.create({ data: { name: 'Globex Corp' } });
    globexTenantId = globex.id;
    const globexDept = await ownerDb.department.create({
      data: { tenantId: globex.id, name: 'Operations' },
    });
    const globexUser = await ownerDb.user.create({
      data: {
        tenantId: globex.id,
        email: 'bob@globex.test',
        passwordHash: empUser!.passwordHash,
        roles: ['MANAGER', 'EMPLOYEE'],
        active: true,
      },
    });
    await ownerDb.employee.create({
      data: {
        tenantId: globex.id,
        userId: globexUser.id,
        employeeNo: 'GLO-001',
        firstName: 'Bob',
        lastName: 'Parr',
        departmentId: globexDept.id,
        position: 'Manager',
        gender: 'MALE',
        maritalStatus: 'MARRIED',
        hireDate: new Date('2024-01-01'),
      },
    });
    globexToken = await getToken('bob@globex.test');
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('1. allows employee to clock in via web punch', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        locationType: 'OFFICE',
        notes: 'In office for client sprint review',
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('CLOCKED_IN');
    expect(res.body.record).toHaveProperty('id');
    expect(res.body.record.timeIn).toBeTruthy();
    expect(res.body.record.locationType).toBe('OFFICE');
  });

  it('2. retrieves today punch status for employee', async () => {
    const res = await request(app.getHttpServer())
      .get('/attendance/today')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.employeeId).toBe(employeeId);
    expect(res.body.timeIn).toBeTruthy();
  });

  it('3. allows employee to clock out via web punch', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/punch')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        notes: 'Shift completed',
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('CLOCKED_OUT');
    expect(res.body.record.timeOut).toBeTruthy();
  });

  it('4. returns monthly DTR for employee', async () => {
    const res = await request(app.getHttpServer())
      .get('/attendance/my-dtr')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].employeeId).toBe(employeeId);
  });

  it('5. prevents regular employee from accessing team DTR (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/attendance/team-dtr')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('6. allows manager to view their direct reports team DTR', async () => {
    const res = await request(app.getHttpServer())
      .get('/attendance/team-dtr')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const empInTeam = res.body.find((e: any) => e.employeeId === employeeId);
    expect(empInTeam).toBeTruthy();
    expect(empInTeam.firstName).toBe('Gabriela');
    expect(empInTeam.attendance).toBeTruthy();
  });

  let missedPunchRequestId: string;

  it('7. allows employee to file a missed punch correction request', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/corrections')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'MISSED_PUNCH',
        date: '2026-11-05',
        proposedTimeIn: '2026-11-05T08:55:00.000Z',
        proposedTimeOut: '2026-11-05T18:05:00.000Z',
        locationType: 'OFFICE',
        reason: 'Office badge reader was offline in the morning',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.type).toBe('MISSED_PUNCH');
    missedPunchRequestId = res.body.id;
  });

  it('8. employee cannot decide their own correction request (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/attendance/corrections/${missedPunchRequestId}/decision`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        decision: 'APPROVE',
        comment: 'Self approval attempt',
      });

    expect(res.status).toBe(403);
  });

  it('9. manager sees pending request in awaiting scope and approves it', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/attendance/corrections?scope=awaiting')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(listRes.status).toBe(200);
    const found = listRes.body.find((r: any) => r.id === missedPunchRequestId);
    expect(found).toBeTruthy();

    const decideRes = await request(app.getHttpServer())
      .post(`/attendance/corrections/${missedPunchRequestId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        decision: 'APPROVE',
        comment: 'Badge reader failure confirmed by IT',
      });

    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('APPROVED');

    // Verify attendance record for 2026-11-05 was created/updated
    const dtrRes = await request(app.getHttpServer())
      .get('/attendance/my-dtr?month=2026-11')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(dtrRes.status).toBe(200);
    const rectified = dtrRes.body.find(
      (r: any) => r.date.slice(0, 10) === '2026-11-05',
    );
    expect(rectified).toBeTruthy();
    expect(rectified.source).toBe('CORRECTION_OB');
    expect(rectified.notes).toContain('Badge reader failure confirmed by IT');
  });

  let obRequestId: string;

  it('10. allows employee to file an Official Business (OB) slip for field deployment', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/corrections')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        type: 'OFFICIAL_BUSINESS',
        date: '2026-11-06',
        locationType: 'FIELD_CLIENT_SITE',
        destination: 'BGC Corporate Tower, Taguig',
        reason: 'ERP System integration and user training with Client Stakeholders',
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('OFFICIAL_BUSINESS');
    expect(res.body.destination).toBe('BGC Corporate Tower, Taguig');
    obRequestId = res.body.id;
  });

  it('11. manager approves OB slip, marking DTR as OFFICIAL_BUSINESS with 0 penalty', async () => {
    const decideRes = await request(app.getHttpServer())
      .post(`/attendance/corrections/${obRequestId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        decision: 'APPROVE',
        comment: 'Client meeting approved',
      });

    expect(decideRes.status).toBe(200);
    expect(decideRes.body.status).toBe('APPROVED');

    // Verify AttendanceRecord has status OFFICIAL_BUSINESS and 0 late minutes
    const dtrRes = await request(app.getHttpServer())
      .get('/attendance/my-dtr?month=2026-11')
      .set('Authorization', `Bearer ${employeeToken}`);

    const obRecord = dtrRes.body.find(
      (r: any) => r.date.slice(0, 10) === '2026-11-06',
    );
    expect(obRecord).toBeTruthy();
    expect(obRecord.status).toBe('OFFICIAL_BUSINESS');
    expect(obRecord.lateMinutes).toBe(0);
    expect(obRecord.undertimeMinutes).toBe(0);
    expect(obRecord.notes).toContain('BGC Corporate Tower, Taguig');
  });

  it('12. ensures tenant isolation: cross-tenant user cannot view or decide Acme attendance', async () => {
    // Globex user tries to decide Acme's request
    const decideRes = await request(app.getHttpServer())
      .post(`/attendance/corrections/${obRequestId}/decision`)
      .set('Authorization', `Bearer ${globexToken}`)
      .send({
        decision: 'REJECT',
      });

    // Request was already approved, but more importantly, Globex does not see it -> 404
    expect(decideRes.status).toBe(404);

    // Globex user viewing awaiting corrections receives empty array for Acme's data
    const listRes = await request(app.getHttpServer())
      .get('/attendance/corrections?scope=awaiting')
      .set('Authorization', `Bearer ${globexToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(0);
  });

  it('13. automatically integrates attendance tardiness and unexcused absences into payroll computation', async () => {
    const empUser = await ownerDb.user.findUnique({
      where: { email: 'employee@acgt.test' },
      include: { employee: true },
    });
    const tenantId = empUser!.tenantId;

    // Create an isolated October payroll period
    const octoberPeriod = await ownerDb.payrollPeriod.create({
      data: {
        tenantId,
        name: 'October 2026 - First Half',
        cutoffType: 'FIRST_HALF',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z'),
        payDate: new Date('2026-10-15T00:00:00.000Z'),
        workingDays: 11,
      },
    });

    // Insert an isolated late attendance record (60 mins late) and an unexcused absent record in October
    await ownerDb.attendanceRecord.createMany({
      data: [
        {
          tenantId,
          employeeId,
          date: new Date('2026-10-05T00:00:00.000Z'),
          status: 'LATE',
          lateMinutes: 60,
          undertimeMinutes: 0,
          locationType: 'OFFICE',
          source: 'WEB_PUNCH',
        },
        {
          tenantId,
          employeeId,
          date: new Date('2026-10-06T00:00:00.000Z'),
          status: 'ABSENT',
          lateMinutes: 0,
          undertimeMinutes: 0,
          locationType: 'OFFICE',
          source: 'WEB_PUNCH',
        },
      ],
    });

    // HR creates a payroll run for October
    const createRunRes = await request(app.getHttpServer())
      .post('/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        payrollPeriodId: octoberPeriod.id,
        runNumber: 'PR-ATTENDANCE-OCT-2026',
      });

    expect(createRunRes.status).toBe(201);
    const runId = createRunRes.body.id;

    // HR computes payroll
    const computeRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/compute`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(computeRes.status).toBe(200);

    // Verify employee item has deductions for absence and tardiness
    const empItem = computeRes.body.items.find((it: any) => it.employeeId === employeeId);
    expect(empItem).toBeTruthy();
    expect(Number(empItem.absencesDeduction)).toBeGreaterThan(0);

    const absenceLine = empItem.lines.find((ln: any) => ln.code === 'ABSENCE');
    expect(absenceLine).toBeTruthy();
    expect(Number(absenceLine.quantity)).toBe(1); // Exactly 1 absent day

    const tardinessLine = empItem.lines.find((ln: any) => ln.code === 'TARDINESS');
    expect(tardinessLine).toBeTruthy();
    expect(Number(tardinessLine.quantity)).toBe(60); // Exactly 60 mins tardy
  });
});
