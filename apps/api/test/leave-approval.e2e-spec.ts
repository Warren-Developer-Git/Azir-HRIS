import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Leave Approval Flow (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let employeeToken: string;
  let managerToken: string;
  let hrToken: string;
  let hr2Token: string;
  let otherManagerToken: string;
  let vlTypeId: string;
  let matTypeId: string;

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

    employeeToken = await getToken('employee@acme.test');
    managerToken = await getToken('manager@acme.test');
    hrToken = await getToken('hr@acme.test');
    hr2Token = await getToken('hr2@acme.test');
    otherManagerToken = await getToken('depthead@acme.test');

    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    const types = typesRes.body as Array<{ id: string; code: string }>;
    vlTypeId = types.find((t) => t.code === 'VL')!.id;
    matTypeId = types.find((t) => t.code === 'MAT')!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('full approval path: employee files -> manager approves -> HR approves -> balance deducted', async () => {
    // 1. Employee files 2 days VL
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-16',
        endDate: '2026-11-17',
        reason: 'Holiday break',
      });
    expect(fileRes.status).toBe(201);
    const reqId = fileRes.body.id;
    expect(fileRes.body.status).toBe('PENDING_MANAGER');

    // 2. Manager approves
    const mgrRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'APPROVED', comment: 'Looks good' });

    expect(mgrRes.status).toBe(200);
    expect(mgrRes.body.status).toBe('PENDING_HR');
    expect(mgrRes.body.approvals.length).toBe(1);
    expect(mgrRes.body.approvals[0].step).toBe('MANAGER');

    // 3. HR approves
    const hrRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED', comment: 'Approved by HR' });

    expect(hrRes.status).toBe(200);
    expect(hrRes.body.status).toBe('APPROVED');
    expect(hrRes.body.approvals.length).toBe(2);

    // 4. Verify balance: balance deducted from 10 to 8, pending is 0
    const balRes = await request(app.getHttpServer())
      .get('/leave/balances?year=2026')
      .set('Authorization', `Bearer ${employeeToken}`);

    const vlBal = balRes.body.find((b: any) => b.code === 'VL');
    expect(vlBal.balance).toBe(8);
    expect(vlBal.pending).toBe(0);
    expect(vlBal.available).toBe(8);
  });

  it('approving MAT (PER_EVENT) does not create a ledger deduction entry', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: matTypeId,
        startDate: '2026-11-20',
        endDate: '2026-11-25',
        reason: 'Maternity leave event',
      });
    expect(fileRes.status).toBe(201);
    const reqId = fileRes.body.id;

    // Manager approve
    await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'APPROVED' });

    // HR approve
    const hrRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });

    expect(hrRes.status).toBe(200);
    expect(hrRes.body.status).toBe('APPROVED');

    // Check no ledger deduction row was created for MAT
    const ledgerRows = await ownerDb.leaveLedgerEntry.findMany({
      where: { requestId: reqId },
    });
    expect(ledgerRows.length).toBe(0);
  });

  it('rejects decision by another manager with 404', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-01',
        endDate: '2026-12-02',
        reason: 'Testing access',
      });
    const reqId = fileRes.body.id;

    // depthead is not employee's direct manager
    const wrongMgrRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${otherManagerToken}`)
      .send({ decision: 'APPROVED' });

    expect(wrongMgrRes.status).toBe(404);
  });

  it('rejects self-approval for HR: hr cannot approve their own request', async () => {
    // HR files leave -> goes to depthead (manager) -> then PENDING_HR
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-03',
        endDate: '2026-12-04',
        reason: 'HR vacation',
      });
    const reqId = fileRes.body.id;

    // Depthead (manager of HR) approves
    await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${otherManagerToken}`)
      .send({ decision: 'APPROVED' });

    // HR tries to approve own request -> 403
    const selfApproveRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.message).toBe('You cannot approve your own request');

    // hr2 approves -> 200 APPROVED
    const secondHrRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hr2Token}`)
      .send({ decision: 'APPROVED' });

    expect(secondHrRes.status).toBe(200);
    expect(secondHrRes.body.status).toBe('APPROVED');
  });

  it('requires comment when rejecting (400 if missing, 200 with comment)', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-15',
        endDate: '2026-12-16',
        reason: 'Trip',
      });
    const reqId = fileRes.body.id;

    // Reject without comment -> 400
    const noCommentRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'REJECTED' });

    expect(noCommentRes.status).toBe(400);
    expect(noCommentRes.body.message).toBe('A reason is required to reject');

    // Reject with comment -> 200 REJECTED
    const rejectRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'REJECTED', comment: 'Team coverage needed' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');
  });

  it('handles race condition: second decision on already decided request returns 409', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-21',
        endDate: '2026-12-22',
        reason: 'Pre-Christmas',
      });
    const reqId = fileRes.body.id;

    await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'APPROVED' });

    // Parallel approvals by HR and HR2
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post(`/leave/requests/${reqId}/decision`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ decision: 'APPROVED' }),
      request(app.getHttpServer())
        .post(`/leave/requests/${reqId}/decision`)
        .set('Authorization', `Bearer ${hr2Token}`)
        .send({ decision: 'APPROVED' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Exactly 1 DEDUCT ledger entry exists
    const deductEntries = await ownerDb.leaveLedgerEntry.findMany({
      where: { requestId: reqId, type: 'DEDUCT' },
    });
    expect(deductEntries.length).toBe(1);
  });
});
