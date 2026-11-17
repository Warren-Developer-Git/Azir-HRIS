import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Dashboard API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let employeeToken: string;
  let managerToken: string;
  let hrToken: string;

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

    // Employee files a request so manager has an awaiting request
    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    const types = typesRes.body as Array<{ id: string; code: string }>;
    const vlTypeId = types.find((t) => t.code === 'VL')!.id;

    await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-25',
        endDate: '2026-11-26',
        reason: 'Rest and recreation',
      });
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('employee response has myBalances and myRecentRequests, but NO headcount key', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.myBalances).toBeDefined();
    expect(Array.isArray(res.body.myBalances)).toBe(true);
    expect(res.body.myRecentRequests).toBeDefined();
    expect(res.body.headcount).toBeUndefined();
  });

  it('HR response includes headcount breakdown by department', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.headcount).toBeDefined();
    expect(typeof res.body.headcount.total).toBe('number');
    expect(res.body.headcount.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.headcount.byDepartment)).toBe(true);
  });

  it('manager response includes awaitingMe with count and items', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.awaitingMe).toBeDefined();
    expect(res.body.awaitingMe.count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.awaitingMe.items)).toBe(true);
    expect(res.body.awaitingMe.items.length).toBeGreaterThanOrEqual(1);
  });
});
