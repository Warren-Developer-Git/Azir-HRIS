import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Balances API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;
  let employeeId: string;
  let vlTypeId: string;
  let silTypeId: string;
  let slTypeId: string;

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

    adminToken = await getToken('admin@acme.test');
    hrToken = await getToken('hr@acme.test');
    employeeToken = await getToken('employee@acme.test');

    // Get employee details
    const empRes = await request(app.getHttpServer())
      .get('/me/profile')
      .set('Authorization', `Bearer ${employeeToken}`);
    employeeId = empRes.body.id;

    // Get leave types
    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${adminToken}`);
    const types = typesRes.body as Array<{ id: string; code: string }>;
    vlTypeId = types.find((t) => t.code === 'VL')!.id;
    silTypeId = types.find((t) => t.code === 'SIL')!.id;
    slTypeId = types.find((t) => t.code === 'SL')!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  describe('Annual Grant (POST /leave/balances/grant)', () => {
    it('employee calling grant returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/leave/balances/grant')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ year: 2027 });

      expect(res.status).toBe(403);
    });

    it('HR grants 2027 balances for all eligible employees, and second run is idempotent (created: 0)', async () => {
      // First run for 2027
      const res1 = await request(app.getHttpServer())
        .post('/leave/balances/grant')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ year: 2027 });

      expect(res1.status).toBe(201);
      expect(res1.body.created).toBe(21); // 7 employees * 3 yearly types (VL, SL, SIL)

      // Second run is idempotent
      const res2 = await request(app.getHttpServer())
        .post('/leave/balances/grant')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ year: 2027 });

      expect(res2.status).toBe(201);
      expect(res2.body.created).toBe(0);
    });

    it('new hire gets VL and SL grants but not SIL if minServiceMonths (12) is not met', async () => {
      // Create new hire with hireDate yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const createEmpRes = await request(app.getHttpServer())
        .post('/employees')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          email: 'newbie@acme.test',
          employeeNo: 'ACM-099',
          firstName: 'New',
          lastName: 'Hire',
          position: 'Junior Dev',
          hireDate: yesterday.toISOString().split('T')[0],
          gender: 'FEMALE',
          maritalStatus: 'SINGLE',
        });

      expect(createEmpRes.status).toBe(201);
      const newEmpId = createEmpRes.body.employee.id;

      // Grant for 2028
      const res = await request(app.getHttpServer())
        .post('/leave/balances/grant')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ year: 2028 });

      expect(res.status).toBe(201);

      // Check balances for new hire in 2028
      const balancesRes = await request(app.getHttpServer())
        .get(`/employees/${newEmpId}/balances?year=2028`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(balancesRes.status).toBe(200);
      const balances = balancesRes.body as Array<{ code: string; balance: number }>;

      const vlBal = balances.find((b) => b.code === 'VL');
      const slBal = balances.find((b) => b.code === 'SL');
      const silBal = balances.find((b) => b.code === 'SIL');

      expect(vlBal?.balance).toBe(10);
      expect(slBal?.balance).toBe(10);
      expect(silBal?.balance).toBe(0); // Not eligible for SIL
    });
  });

  describe('Employee Balances Query (GET /employees/:id/balances)', () => {
    it('employee can view own balances', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/balances?year=2026`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it('HR can view any employee balances', async () => {
      const res = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/balances?year=2026`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Manual Balance Adjustments (POST /employees/:id/balance-adjustments)', () => {
    it('employee cannot adjust balances (403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/balance-adjustments`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: vlTypeId,
          year: 2026,
          days: 2,
          reason: 'Unauthorized attempt',
        });

      expect(res.status).toBe(403);
    });

    it('HR adjusts balance +2 days successfully', async () => {
      // Initial VL balance is 10
      const adjustRes = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/balance-adjustments`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          leaveTypeId: vlTypeId,
          year: 2026,
          days: 2,
          reason: 'Overtime credit bonus',
        });

      expect(adjustRes.status).toBe(201);
      expect(adjustRes.body.days).toBe(2);
      expect(adjustRes.body.balance).toBe(12);

      // Verify with GET balances
      const balRes = await request(app.getHttpServer())
        .get(`/employees/${employeeId}/balances?year=2026`)
        .set('Authorization', `Bearer ${hrToken}`);

      const vl = balRes.body.find((b: any) => b.code === 'VL');
      expect(vl.balance).toBe(12);
    });

    it('HR adjustment that causes negative balance returns 400', async () => {
      const adjustRes = await request(app.getHttpServer())
        .post(`/employees/${employeeId}/balance-adjustments`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          leaveTypeId: vlTypeId,
          year: 2026,
          days: -20, // Current balance is 12, so 12 - 20 = -8 < 0
          reason: 'Excessive deduction penalty',
        });

      expect(adjustRes.status).toBe(400);
      expect(adjustRes.body.message).toBe('Adjustment would make the balance negative');
    });
  });
});
