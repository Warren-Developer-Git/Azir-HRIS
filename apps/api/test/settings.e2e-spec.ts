import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Settings API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let adminToken: string;
  let hrToken: string;
  let employeeToken: string;
  let engDeptId: string;
  let vlTypeId: string;

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

    const deptsRes = await request(app.getHttpServer())
      .get('/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    const depts = deptsRes.body as Array<{ id: string; name: string }>;
    engDeptId = depts.find((d) => d.name === 'Engineering')!.id;

    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${adminToken}`);
    const types = typesRes.body as Array<{ id: string; code: string }>;
    vlTypeId = types.find((t) => t.code === 'VL')!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  describe('Departments', () => {
    it('HR cannot create department (needs department.write -> 403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ name: 'Unauthorized Dept' });

      expect(res.status).toBe(403);
    });

    it('admin creates, edits, and hard-deletes an unused department', async () => {
      // 1. Create
      const createRes = await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Logistics' });

      expect(createRes.status).toBe(201);
      const deptId = createRes.body.id;
      expect(createRes.body.name).toBe('Logistics');

      // 2. Edit
      const editRes = await request(app.getHttpServer())
        .patch(`/departments/${deptId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Global Logistics' });

      expect(editRes.status).toBe(200);
      expect(editRes.body.name).toBe('Global Logistics');

      // 3. Delete unused
      const delRes = await request(app.getHttpServer())
        .delete(`/departments/${deptId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Verify no longer exists
      const deptsRes = await request(app.getHttpServer())
        .get('/departments?includeInactive=true')
        .set('Authorization', `Bearer ${adminToken}`);
      const found = deptsRes.body.find((d: any) => d.id === deptId);
      expect(found).toBeUndefined();
    });

    it('deleting a department in use deactivates it instead of hard-deleting', async () => {
      const delRes = await request(app.getHttpServer())
        .delete(`/departments/${engDeptId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deactivated).toBe(true);

      // Not in active list
      const activeRes = await request(app.getHttpServer())
        .get('/departments')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(activeRes.body.find((d: any) => d.id === engDeptId)).toBeUndefined();

      // Present in includeInactive list
      const allRes = await request(app.getHttpServer())
        .get('/departments?includeInactive=true')
        .set('Authorization', `Bearer ${adminToken}`);
      const eng = allRes.body.find((d: any) => d.id === engDeptId);
      expect(eng).toBeDefined();
      expect(eng.active).toBe(false);
    });
  });

  describe('Leave Types', () => {
    it('admin creates, edits, and hard-deletes an unused leave type', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/leave-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'BER',
          name: 'Bereavement Leave',
          kind: 'PER_EVENT',
          defaultDays: 3,
          countingMode: 'WORKING_DAYS',
          minServiceMonths: 0,
        });

      expect(createRes.status).toBe(201);
      const typeId = createRes.body.id;
      expect(createRes.body.code).toBe('BER');

      // Edit name & defaultDays
      const editRes = await request(app.getHttpServer())
        .patch(`/leave-types/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Compassionate Bereavement Leave', defaultDays: 4 });

      expect(editRes.status).toBe(200);
      expect(editRes.body.name).toBe('Compassionate Bereavement Leave');
      expect(editRes.body.defaultDays).toBe(4);

      // Delete unused
      const delRes = await request(app.getHttpServer())
        .delete(`/leave-types/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });

    it('deleting a used leave type deactivates it, preventing future filing', async () => {
      const delRes = await request(app.getHttpServer())
        .delete(`/leave-types/${vlTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deactivated).toBe(true);

      // Attempting to file with deactivated leave type returns 400
      const fileRes = await request(app.getHttpServer())
        .post('/leave/requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          leaveTypeId: vlTypeId,
          startDate: '2026-11-26',
          endDate: '2026-11-27',
          reason: 'Test filing',
        });

      expect(fileRes.status).toBe(400);
      expect(fileRes.body.message).toBe('You are not eligible for this leave type');
    });
  });

  describe('Holidays', () => {
    it('admin creates, edits, and deletes a holiday', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/holidays')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ninoy Aquino Day',
          date: '2026-08-21',
          type: 'SPECIAL',
        });

      expect(createRes.status).toBe(201);
      const holidayId = createRes.body.id;

      // Duplicate date returns 409
      const dupRes = await request(app.getHttpServer())
        .post('/holidays')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Another Holiday Same Day',
          date: '2026-08-21',
          type: 'REGULAR',
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.message).toBe('A holiday already exists on this date');

      // Edit name
      const editRes = await request(app.getHttpServer())
        .patch(`/holidays/${holidayId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ninoy Aquino Memorial Day' });

      expect(editRes.status).toBe(200);
      expect(editRes.body.name).toBe('Ninoy Aquino Memorial Day');

      // Delete
      const delRes = await request(app.getHttpServer())
        .delete(`/holidays/${holidayId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });
});
