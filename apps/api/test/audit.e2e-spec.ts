import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Audit Logs API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let hrToken: string;
  let employeeToken: string;
  let bayanihanHrToken: string;

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

    hrToken = await getToken('hr@acme.test');
    employeeToken = await getToken('employee@acme.test');
    bayanihanHrToken = await getToken('hr@bayanihan.test');

    // Create a department in Acme to generate an audit log
    await request(app.getHttpServer())
      .post('/departments')
      .set('Authorization', `Bearer ${await getToken('admin@acme.test')}`)
      .send({ name: 'Quality Assurance' });
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('employee calling GET /audit-logs returns 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('HR sees Acme rows only, tenant isolation is strictly preserved', async () => {
    const acmeRes = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(acmeRes.status).toBe(200);
    expect(Array.isArray(acmeRes.body)).toBe(true);
    expect(acmeRes.body.length).toBeGreaterThanOrEqual(1);

    // Acme HR should see the Department creation
    const foundDept = acmeRes.body.find((log: any) => log.entity === 'Department');
    expect(foundDept).toBeDefined();
    expect(foundDept.action).toBe('create');

    // Bayanihan HR calling GET /audit-logs sees Bayanihan logs, never Acme's
    const bynRes = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${bayanihanHrToken}`);

    expect(bynRes.status).toBe(200);
    const bynDept = bynRes.body.find((log: any) => log.entity === 'Department');
    expect(bynDept).toBeUndefined(); // Acme's dept is never visible to Bayanihan
  });

  it('supports entity filter ?entity=Department', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit-logs?entity=Department')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const log of res.body) {
      expect(log.entity).toBe('Department');
    }
  });

  it('supports cursor pagination with ?before=', async () => {
    const initialRes = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${hrToken}`);

    if (initialRes.body.length > 1) {
      const firstLogCreatedAt = initialRes.body[0].createdAt;
      const pageRes = await request(app.getHttpServer())
        .get(`/audit-logs?before=${firstLogCreatedAt}`)
        .set('Authorization', `Bearer ${hrToken}`);

      expect(pageRes.status).toBe(200);
      for (const log of pageRes.body) {
        expect(new Date(log.createdAt).getTime()).toBeLessThan(
          new Date(firstLogCreatedAt).getTime(),
        );
      }
    }
  });
});
