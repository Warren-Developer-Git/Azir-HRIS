import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Payroll & Attendance Adjustments Flow (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let employeeToken: string;
  let hrToken: string;
  let hr2Token: string;
  let adminToken: string;
  let employeeId: string;
  let periodId: string;
  let runId: string;

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
    hrToken = await getToken('hr@acgt.test');
    hr2Token = await getToken('hr2@acgt.test');
    adminToken = await getToken('admin@acgt.test');

    // Get employee record for employee@acgt.test
    const empUser = await ownerDb.user.findUnique({
      where: { email: 'employee@acgt.test' },
      include: { employee: true },
    });
    employeeId = empUser!.employee!.id;

    // Set employee salary to 40,000 and allowances to 2,000 for deterministic testing
    await ownerDb.employee.update({
      where: { id: employeeId },
      data: {
        basicSalary: 40000,
        allowances: 2000,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('1. prevents regular employees from accessing HR payroll endpoints (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/periods')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('2. allows HR to list and create a payroll period', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/payroll/periods')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'November 2026 - Second Half',
        cutoffType: 'SECOND_HALF',
        startDate: '2026-11-16',
        endDate: '2026-11-30',
        payDate: '2026-11-30',
        workingDays: 11,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id');
    expect(createRes.body.name).toBe('November 2026 - Second Half');
    expect(createRes.body.workingDays).toBe(11);
    periodId = createRes.body.id;

    const listRes = await request(app.getHttpServer())
      .get('/payroll/periods')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((p: any) => p.id === periodId)).toBe(true);
  });

  it('3. allows HR to initialize a payroll run in DRAFT status', async () => {
    const res = await request(app.getHttpServer())
      .post('/payroll/runs')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        payrollPeriodId: periodId,
        runNumber: 'PR-2026-11-1',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.runNumber).toBe('PR-2026-11-1');
    expect(res.body.status).toBe('DRAFT');
    runId = res.body.id;
  });

  it('4. allows HR to add attendance / payroll adjustments (e.g. Overtime & Bonus)', async () => {
    // Add 8 hours overtime for employee
    const otRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/adjustments`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        employeeId,
        type: 'OVERTIME_HOURS',
        quantity: 8,
        description: 'November Sprint Overtime',
      });

    expect(otRes.status).toBe(201);
    expect(otRes.body.type).toBe('OVERTIME_HOURS');
    expect(Number(otRes.body.quantity)).toBe(8);

    // Add performance bonus
    const bonusRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/adjustments`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        employeeId,
        type: 'BONUS',
        amount: 2000,
        description: 'Mid-month performance award',
      });

    expect(bonusRes.status).toBe(201);
    expect(bonusRes.body.type).toBe('BONUS');
    expect(Number(bonusRes.body.amount)).toBe(2000);
  });

  it('5. computes gross-to-net payroll for all employees in the run', async () => {
    const computeRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/compute`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(computeRes.status).toBe(200);
    expect(computeRes.body.status).toBe('COMPUTED');
    expect(Number(computeRes.body.totalGross)).toBeGreaterThan(0);
    expect(Number(computeRes.body.totalNet)).toBeGreaterThan(0);

    // Fetch details
    const detailsRes = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(detailsRes.status).toBe(200);
    expect(detailsRes.body.items.length).toBeGreaterThan(0);

    // Find our specific employee's item
    const empItem = detailsRes.body.items.find(
      (it: any) => it.employeeId === employeeId,
    );
    expect(empItem).toBeDefined();

    // Semi-monthly basic pay = 40,000 / 2 = 20,000
    expect(Number(empItem.basicPay)).toBe(20000);
    // Allowances = 2,000 / 2 = 1,000
    expect(Number(empItem.allowances)).toBe(1000);
    // Overtime pay for 8 hours (Hourly rate = (40,000 * 12 / 261) / 8 = 229.89 * 1.25 * 8 = 2298.85)
    expect(Number(empItem.overtimePay)).toBeGreaterThan(2000);
    // Net pay must be calculated correctly
    expect(Number(empItem.netPay)).toBeGreaterThan(0);
    expect(empItem.lines.length).toBeGreaterThanOrEqual(6);
  });

  it('6. enforces separation of duties / anti-self approval', async () => {
    // HR who prepared the run cannot be sole approver if another HR/Admin exists
    const selfApproveRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ action: 'APPROVE' });

    expect(selfApproveRes.status).toBe(400);
    expect(selfApproveRes.body.message).toMatch(/cannot approve.*prepared/i);
  });

  it('7. allows a second HR or Admin to approve and lock the run, generating signed payslips', async () => {
    const approveRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/decision`)
      .set('Authorization', `Bearer ${hr2Token}`)
      .send({ action: 'APPROVE' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('LOCKED');
    expect(approveRes.body.approvedById).toBeDefined();
    expect(approveRes.body.lockedAt).toBeDefined();

    // Verify that adjustments can no longer be added to a locked run
    const blockedAdjRes = await request(app.getHttpServer())
      .post(`/payroll/runs/${runId}/adjustments`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        employeeId,
        type: 'BONUS',
        amount: 500,
        description: 'Late bonus',
      });

    expect(blockedAdjRes.status).toBe(400);
  });

  it('8. allows an employee to view their generated payslips and download itemized snapshot', async () => {
    // Employee lists their payslips
    const listRes = await request(app.getHttpServer())
      .get('/payroll/my-payslips')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);

    const mySlip = listRes.body[0];
    expect(mySlip).toHaveProperty('id');
    expect(mySlip).toHaveProperty('netPay');
    expect(mySlip).toHaveProperty('periodName');

    // Employee gets full payslip details
    const detailRes = await request(app.getHttpServer())
      .get(`/payroll/my-payslips/${mySlip.id}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body).toHaveProperty('payrollItem');
    expect(detailRes.body).toHaveProperty('employee');
    expect(detailRes.body).toHaveProperty('verification');
    expect(detailRes.body.payrollItem.lines.length).toBeGreaterThanOrEqual(6);
    expect(detailRes.body.verification.verificationCode).toBeDefined();
  });

  it('9. strictly enforces tenant isolation across organizations', async () => {
    // Login as HR of Bayanihan Foods (Tenant 2)
    const bynLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@bayanihan.test', password: 'Demo1234!' });
    const bynHrToken = bynLoginRes.body.accessToken;

    // Bayanihan HR cannot see Acme's periods
    const periodsRes = await request(app.getHttpServer())
      .get('/payroll/periods')
      .set('Authorization', `Bearer ${bynHrToken}`);

    expect(periodsRes.status).toBe(200);
    const acmePeriodFound = periodsRes.body.find((p: any) => p.id === periodId);
    expect(acmePeriodFound).toBeUndefined();

    // Bayanihan HR cannot access Acme's run details
    const runRes = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}`)
      .set('Authorization', `Bearer ${bynHrToken}`);

    expect(runRes.status).toBe(404);
  });

  it('10. exports payroll run summary with statutory remittances breakdown', async () => {
    // Regular employee cannot view payroll run summary
    const empForbidden = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}/summary`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empForbidden.status).toBe(403);

    // HR can view comprehensive statutory remittance summary
    const summaryRes = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}/summary`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(summaryRes.status).toBe(200);
    const summary = summaryRes.body;
    expect(summary.runId).toBe(runId);
    expect(summary.runNumber).toBeDefined();
    expect(summary.status).toBe('LOCKED');
    expect(summary.headcount).toBeGreaterThan(0);

    // Grand totals
    expect(Number(summary.grandTotals.grossPay)).toBeGreaterThan(0);
    expect(Number(summary.grandTotals.netDisbursement)).toBeGreaterThan(0);

    // Statutory breakdown
    expect(Number(summary.statutoryRemittances.sss.employeeShare)).toBeGreaterThan(0);
    expect(Number(summary.statutoryRemittances.sss.employerShare)).toBeGreaterThan(0);
    expect(Number(summary.statutoryRemittances.sss.total)).toBe(
      Number(summary.statutoryRemittances.sss.employeeShare) +
        Number(summary.statutoryRemittances.sss.employerShare),
    );

    expect(Number(summary.statutoryRemittances.philHealth.employeeShare)).toBeGreaterThan(0);
    expect(Number(summary.statutoryRemittances.philHealth.employerShare)).toBeGreaterThan(0);

    expect(Number(summary.statutoryRemittances.pagIbig.employeeShare)).toBeGreaterThan(0);
    expect(Number(summary.statutoryRemittances.pagIbig.employerShare)).toBeGreaterThan(0);

    expect(Number(summary.statutoryRemittances.grandTotalRemittance)).toBeGreaterThan(0);
  });

  it('11. exports standard Philippine payroll register as CSV with tenant isolation', async () => {
    const bynLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@bayanihan.test', password: 'Demo1234!' });
    const bynHrToken = bynLoginRes.body.accessToken;

    // Tenant 2 cannot export Tenant 1's register
    const bynExportRes = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}/export-csv`)
      .set('Authorization', `Bearer ${bynHrToken}`);
    expect(bynExportRes.status).toBe(404);

    // HR can export standard CSV register
    const exportRes = await request(app.getHttpServer())
      .get(`/payroll/runs/${runId}/export-csv`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.headers['content-disposition']).toContain('attachment; filename=');

    const csv = exportRes.text;
    expect(csv).toContain('Employee No,Employee Name,Department,Position');
    expect(csv).toContain('Basic Salary,Allowances,Overtime Pay');
    expect(csv).toContain('SSS (EE),SSS (ER),PhilHealth (EE),PhilHealth (ER),Pag-IBIG (EE),Pag-IBIG (ER)');
    expect(csv).toContain('Withholding Tax,Other Deductions,Total Deductions,Net Pay');
    expect(csv).toContain('TOTALS');
  });
});
