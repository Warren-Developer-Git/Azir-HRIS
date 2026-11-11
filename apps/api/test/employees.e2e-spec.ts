import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Employees API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let adminToken: string;
  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;
  let bayanihanHrToken: string;
  let employeeId: string;

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
    managerToken = await getToken('manager@acme.test');
    employeeToken = await getToken('employee@acme.test');
    bayanihanHrToken = await getToken('hr@bayanihan.test');

    const empUser = await ownerDb.user.findUnique({
      where: { email: 'employee@acme.test' },
      include: { employee: true },
    });
    employeeId = empUser!.employee!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('HR creates a new employee and the employee can log in with temporary password', async () => {
    const res = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Jose',
        lastName: 'Rizal',
        email: 'jose.rizal@acme.test',
        employeeNo: 'ACM-099',
        position: 'Software Engineer',
        hireDate: '2026-01-15',
        gender: 'MALE',
        maritalStatus: 'SINGLE',
      });

    expect(res.status).toBe(201);
    expect(res.body.employee).toBeDefined();
    expect(res.body.employee.firstName).toBe('Jose');
    expect(res.body.temporaryPassword).toBeDefined();

    // Verify the new employee can log in with temporary password
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'jose.rizal@acme.test',
        password: res.body.temporaryPassword,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'Email',
        email: 'employee@acme.test',
        employeeNo: 'ACM-100',
        position: 'Staff',
        hireDate: '2026-02-01',
        gender: 'MALE',
        maritalStatus: 'SINGLE',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email is already in use');
  });

  it('rejects duplicate employeeNo with 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'Number',
        email: 'unique.number@acme.test',
        employeeNo: 'ACM-001',
        position: 'Staff',
        hireDate: '2026-02-01',
        gender: 'MALE',
        maritalStatus: 'SINGLE',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Employee number is already in use');
  });

  it('forbids assigning admin roles without role.assign permission', async () => {
    const res = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Privileged',
        lastName: 'User',
        email: 'priv@acme.test',
        employeeNo: 'ACM-101',
        position: 'Staff',
        hireDate: '2026-02-01',
        gender: 'MALE',
        maritalStatus: 'SINGLE',
        roles: ['ADMIN', 'EMPLOYEE'],
      });

    expect(res.status).toBe(403);
  });

  it('employee calling GET /employees with scope=all gets 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/employees?scope=all')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('manager calling GET /employees with scope=team returns only direct reports', async () => {
    const res = await request(app.getHttpServer())
      .get('/employees?scope=team')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const emp of res.body.data) {
      expect(emp.managerId).toBeDefined();
    }
  });

  it('manager cycle detection prevents employee from reporting to self or subordinate', async () => {
    // Attempting to set employee as their own manager -> 400
    const res = await request(app.getHttpServer())
      .patch(`/employees/${employeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ managerId: employeeId });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Manager cannot report to this employee');
  });

  it('deactivates an employee and prevents login', async () => {
    const deactRes = await request(app.getHttpServer())
      .post(`/employees/${employeeId}/deactivate`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(deactRes.status).toBe(200);
    expect(deactRes.body.status).toBe('INACTIVE');

    // Deactivated user cannot log in
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@acme.test', password: 'Demo1234!' });

    expect(loginRes.status).toBe(401);
  });

  it('forbids deactivating oneself', async () => {
    // Get HR's own employee ID
    const hrProfile = await request(app.getHttpServer())
      .get('/me/profile')
      .set('Authorization', `Bearer ${hrToken}`);

    const res = await request(app.getHttpServer())
      .post(`/employees/${hrProfile.body.id}/deactivate`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You cannot deactivate yourself');
  });

  it('admin sets roles but cannot remove own ADMIN role', async () => {
    const adminProfile = await request(app.getHttpServer())
      .get('/me/profile')
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app.getHttpServer())
      .put(`/employees/${adminProfile.body.id}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roles: ['EMPLOYEE'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You cannot remove your own admin role');
  });

  it('HR resets password and employee can log in with new password', async () => {
    // Activate employee first for test
    await ownerDb.employee.update({
      where: { id: employeeId },
      data: { status: 'ACTIVE' },
    });
    await ownerDb.user.updateMany({
      where: { email: 'employee@acme.test' },
      data: { active: true },
    });

    const resetRes = await request(app.getHttpServer())
      .post(`/employees/${employeeId}/reset-password`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.temporaryPassword).toBeDefined();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'employee@acme.test',
        password: resetRes.body.temporaryPassword,
      });

    expect(loginRes.status).toBe(200);
  });

  it('GET /me/profile and PATCH /me/profile allows updating personal phone, address, and profile picture avatarUrl', async () => {
    const updateRes = await request(app.getHttpServer())
      .patch('/me/profile')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        phone: '+63 917 123 4567',
        address: 'Makati City, Metro Manila',
        avatarUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.phone).toBe('+63 917 123 4567');
    expect(updateRes.body.address).toBe('Makati City, Metro Manila');
    expect(updateRes.body.avatarUrl).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD');

    // Remove avatar
    const removeAvatarRes = await request(app.getHttpServer())
      .patch('/me/profile')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ avatarUrl: null });

    expect(removeAvatarRes.status).toBe(200);
    expect(removeAvatarRes.body.avatarUrl).toBeNull();

    // Reject non-whitelisted fields on /me/profile
    const invalidRes = await request(app.getHttpServer())
      .patch('/me/profile')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ position: 'CEO' });

    expect(invalidRes.status).toBe(400);
  });

  it('Bayanihan HR cannot GET an Acme employee (tenant isolation)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/employees/${employeeId}`)
      .set('Authorization', `Bearer ${bayanihanHrToken}`);

    expect(res.status).toBe(404);
  });
});
