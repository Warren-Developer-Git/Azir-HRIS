import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';

describe('Security Middleware, Compression & Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;

  beforeAll(async () => {
    ownerDb = createOwnerPrisma();
    await resetAndSeedTestDb(ownerDb);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('sets Helmet security headers and hides X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origin and blocks untrusted origins', async () => {
    const allowedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');

    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(allowedRes.headers['access-control-allow-credentials']).toBe('true');

    const blockedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://untrusted-origin.example');

    expect(blockedRes.status).toBe(200);
    expect(blockedRes.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('compresses large JSON API responses with gzip when requested', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@acgt.test', password: 'Demo1234!' });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body.accessToken as string;

    const employeesRes = await request(app.getHttpServer())
      .get('/employees?limit=50')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Encoding', 'gzip');

    expect(employeesRes.status).toBe(200);
    // Compression middleware applies gzip once payload exceeds its 1KB threshold
    if (Buffer.byteLength(JSON.stringify(employeesRes.body)) >= 1024) {
      expect(employeesRes.headers['content-encoding']).toBe('gzip');
    }
  });

  it('rate-limits rapid POST /notifications/send-email calls at 10/min', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@acgt.test', password: 'Demo1234!' });

    expect(loginRes.status).toBe(200);
    const hrToken = loginRes.body.accessToken as string;

    const empRow = await ownerDb.employee.findFirst({
      where: { user: { email: 'employee@acgt.test' } },
      select: { id: true },
    });

    let hit429 = false;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/notifications/send-email')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          recipientEmployeeId: empRow!.id,
          preset: 'GENERAL_NOTICE',
        });

      if (res.status === 429) {
        hit429 = true;
        break;
      }
      expect(res.status).toBe(200);
    }

    expect(hit429).toBe(true);
  });

  it('rate-limits rapid POST /auth/login attempts with 429 Too Many Requests', async () => {
    let hit429 = false;
    let sawRateLimitHeader = false;

    // Prior test already made 1 login request, so 16 more guarantees exceeding the 15/min cap
    for (let i = 0; i < 16; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `nobody-${i}@acgt.test`, password: 'WrongPassword1!' });

      if (res.headers['x-ratelimit-limit']) {
        sawRateLimitHeader = true;
      }
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }

    expect(sawRateLimitHeader).toBe(true);
    expect(hit429).toBe(true);
  });
});
