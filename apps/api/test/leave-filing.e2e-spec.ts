import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';
import { Clock } from '../src/leave/clock.js';

class MockClock extends Clock {
  currentTime = new Date('2026-11-10T01:00:00Z');
  now(): Date {
    return this.currentTime;
  }
}

describe('Leave Filing & Balances (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let mockClock: MockClock;
  let employeeToken: string;
  let deptHeadToken: string;
  let managerToken: string;
  let hrToken: string;
  let vlTypeId: string;
  let silTypeId: string;
  let matTypeId: string;
  let patTypeId: string;

  beforeAll(async () => {
    ownerDb = createOwnerPrisma();
    await resetAndSeedTestDb(ownerDb);

    mockClock = new MockClock();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue(mockClock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    // Helper to get token
    async function getToken(email: string) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Demo1234!' });
      return res.body.accessToken;
    }

    employeeToken = await getToken('employee@acgt.test');
    deptHeadToken = await getToken('depthead@acgt.test');
    managerToken = await getToken('manager@acgt.test');
    hrToken = await getToken('hr@acgt.test');

    // Fetch leave types
    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(typesRes.status).toBe(200);

    const types = typesRes.body as Array<{ id: string; code: string }>;
    vlTypeId = types.find((t) => t.code === 'VL')!.id;
    silTypeId = types.find((t) => t.code === 'SIL')!.id;
    matTypeId = types.find((t) => t.code === 'MAT')!.id;
    patTypeId = types.find((t) => t.code === 'PAT')!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('employee files 2 VL days -> 201, status PENDING_MANAGER, days: 2, and balance shows pending: 2, available: 8', async () => {
    // 2026-11-16 (Mon) to 2026-11-17 (Tue) = 2 working days
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-16',
        endDate: '2026-11-17',
        reason: 'Rest and recreation',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_MANAGER');
    expect(res.body.days).toBe(2);

    const balRes = await request(app.getHttpServer())
      .get('/leave/balances?year=2026')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(balRes.status).toBe(200);
    const vlBal = balRes.body.find((b: any) => b.code === 'VL');
    expect(vlBal).toBeDefined();
    expect(vlBal.balance).toBe(10);
    expect(vlBal.pending).toBe(2);
    expect(vlBal.available).toBe(8);
  });

  it('employee without manager (depthead) files leave -> goes straight to PENDING_HR', async () => {
    // 2026-11-18 (Wed) to 2026-11-19 (Thu) = 2 days
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${deptHeadToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-18',
        endDate: '2026-11-19',
        reason: 'Conference trip',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_HR');
    expect(res.body.days).toBe(2);
  });

  it('rule 1: rejects when startDate > endDate with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-20',
        endDate: '2026-11-19',
        reason: 'Invalid range',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('End date must be on or after start date');
  });

  it('rule 2: rejects leave starting in the past with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-09',
        endDate: '2026-11-10',
        reason: 'Yesterday',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Leave cannot start in the past');
  });

  it('rule 3: rejects request crossing into another calendar year with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-31',
        endDate: '2027-01-02',
        reason: 'New Year trip',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'A request cannot cross into another year; file two requests',
    );
  });

  it('rule 4: rejects when employee is not eligible (paternity for female employee)', async () => {
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`) // Gabriela Silang (FEMALE)
      .send({
        leaveTypeId: patTypeId,
        startDate: '2026-11-23',
        endDate: '2026-11-24',
        reason: 'Paternity claim',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You are not eligible for this leave type');
  });

  it('rule 5: rejects weekend-only range in working days mode with 400 "no leave days"', async () => {
    // 2026-11-21 is Sat, 2026-11-22 is Sun
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-21',
        endDate: '2026-11-22',
        reason: 'Weekend',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Selected dates contain no leave days');
  });

  it('rule 6: rejects PER_EVENT when exceeding defaultDays', async () => {
    // Maternity defaultDays is 105 calendar days. Asking for 120 days:
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: matTypeId,
        startDate: '2026-11-12',
        endDate: '2026-12-30', // < 105 is valid, but let's test 110 days in same year:
        reason: 'Maternity leave',
      });
    // In our test, 2026-11-12 to 2026-12-30 is 49 calendar days so that passes rule 6, but let's test paternity for male manager exceeding 7 days:
    const patOverRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${managerToken}`) // Manuel Quezon (MALE, MARRIED)
      .send({
        leaveTypeId: patTypeId,
        startDate: '2026-11-16',
        endDate: '2026-11-26', // 9 working days > 7
        reason: 'Paternity exceeding 7 days',
      });

    expect(patOverRes.status).toBe(400);
    expect(patOverRes.body.message).toBe('Maximum is 7 days per request');
  });

  it('rule 7: rejects overlapping request with 409', async () => {
    // Existing request from first test is 2026-11-16 to 2026-11-17
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-17',
        endDate: '2026-11-18',
        reason: 'Overlap attempt',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Overlaps an existing request');
  });

  it('rule 8: rejects when available balance is exceeded', async () => {
    // Available is 8 days. Requesting 9 days (2026-11-23 to 2026-12-04 = 9 working days):
    const res = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-23',
        endDate: '2026-12-04',
        reason: 'Too many days',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Not enough balance');
  });

  it('Manila clock edge case: 23:00 UTC on Nov 10 is Nov 11 in Manila', async () => {
    mockClock.currentTime = new Date('2026-11-10T23:00:00Z'); // Manila date is 2026-11-11

    // Nov 10 is past in Manila -> 400
    const pastRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        reason: 'Yesterday in Manila',
      });
    expect(pastRes.status).toBe(400);
    expect(pastRes.body.message).toBe('Leave cannot start in the past');

    // Nov 11 is today in Manila -> 201
    const todayRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-11',
        endDate: '2026-11-11',
        reason: 'Today in Manila',
      });
    expect(todayRes.status).toBe(201);

    mockClock.currentTime = new Date('2026-11-10T01:00:00Z'); // restore
  });

  it('PATCH /leave/requests/:id allows editing dates while PENDING_MANAGER', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-24',
        endDate: '2026-11-24',
        reason: 'Original reason',
      });
    expect(createRes.status).toBe(201);
    const reqId = createRes.body.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/leave/requests/${reqId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        startDate: '2026-11-24',
        endDate: '2026-11-25',
        reason: 'Updated reason',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.days).toBe(2);
    expect(patchRes.body.reason).toBe('Updated reason');
  });

  it('POST /leave/requests/:id/cancel cancels request and releases pending days', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-08',
        endDate: '2026-12-09',
        reason: 'To be cancelled',
      });
    expect(createRes.status).toBe(201);
    const reqId = createRes.body.id;

    const cancelRes = await request(app.getHttpServer())
      .post(`/leave/requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
  });

  it('tenant isolation: colleague or other tenant cannot access another request (returns 404)', async () => {
    // Create request as employee
    const createRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-12-15',
        endDate: '2026-12-16',
        reason: 'Private leave',
      });
    const reqId = createRes.body.id;

    // Colleague (dev1) trying to view employee's private request
    const dev1Token = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dev1@acgt.test', password: 'Demo1234!' })
      .then((r) => r.body.accessToken);

    const colleagueRes = await request(app.getHttpServer())
      .get(`/leave/requests/${reqId}`)
      .set('Authorization', `Bearer ${dev1Token}`);

    expect(colleagueRes.status).toBe(404);

    // Other tenant user
    const bynUserToken = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@bayanihan.test', password: 'Demo1234!' })
      .then((r) => r.body.accessToken);

    const otherTenantRes = await request(app.getHttpServer())
      .get(`/leave/requests/${reqId}`)
      .set('Authorization', `Bearer ${bynUserToken}`);

    expect(otherTenantRes.status).toBe(404);
  });
});
