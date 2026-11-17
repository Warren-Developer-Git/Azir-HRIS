import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Auth & Session (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;

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
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('POST /auth/login successfully returns accessToken and sets httpOnly refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@acgt.test', password: 'Demo1234!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toMatchObject({
      email: 'employee@acgt.test',
      roles: ['EMPLOYEE'],
      tenantName: 'Azir Company Global Tech',
    });
    expect(res.body.user.name).toBeTruthy();
    expect(res.body.user.employeeId).toBeTruthy();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c) => c.startsWith('refresh='))
      : cookies;
    expect(refreshCookie).toContain('HttpOnly');
  });

  it('POST /auth/login rejects wrong password with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'employee@acgt.test', password: 'WrongPassword999!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('POST /auth/login rejects non-existent email with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@nowhere.test', password: 'Demo1234!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('POST /auth/login rejects inactive user with 401', async () => {
    // Set dev1 to inactive
    await ownerDb.user.updateMany({
      where: { email: 'dev1@acgt.test' },
      data: { active: false },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dev1@acgt.test', password: 'Demo1234!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');

    // Restore dev1 active state
    await ownerDb.user.updateMany({
      where: { email: 'dev1@acgt.test' },
      data: { active: true },
    });
  });

  it('GET /auth/me returns 401 without token and 200 with valid token', async () => {
    const unauthRes = await request(app.getHttpServer()).get('/auth/me');
    expect(unauthRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@acgt.test', password: 'Demo1234!' });

    const authRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(authRes.status).toBe(200);
    expect(authRes.body.email).toBe('hr@acgt.test');
    expect(authRes.body.roles).toContain('HR');
  });

  it('POST /auth/refresh returns a new accessToken using the refresh cookie', async () => {
    const noCookieRes = await request(app.getHttpServer()).post('/auth/refresh');
    expect(noCookieRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@acgt.test', password: 'Demo1234!' });

    const cookieHeader = loginRes.headers['set-cookie'];

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body.user.email).toBe('admin@acgt.test');
  });

  it('POST /auth/logout clears the refresh cookie', async () => {
    const res = await request(app.getHttpServer()).post('/auth/logout');
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c) => c.startsWith('refresh='))
      : cookies;
    expect(refreshCookie).toMatch(/Expires=|Max-Age=0/);
  });

  describe('POST /auth/change-password', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ oldPassword: 'Demo1234!', newPassword: 'NewPassword123!' });
      expect(res.status).toBe(401);
    });

    it('rejects invalid or wrong current password with 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'Demo1234!' });
      const token = loginRes.body.accessToken;

      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'WrongPassword!', newPassword: 'NewPassword123!' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Current password does not match/);
    });

    it('rejects short new passwords (< 8 chars) with 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'Demo1234!' });
      const token = loginRes.body.accessToken;

      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'Demo1234!', newPassword: 'short' });
      expect(res.status).toBe(400);
    });

    it('rejects new password if identical to current password with 400', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'Demo1234!' });
      const token = loginRes.body.accessToken;

      const res = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'Demo1234!', newPassword: 'Demo1234!' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/same as your current password/);
    });

    it('successfully changes password, verifies old password fails login, and new password succeeds', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'Demo1234!' });
      const token = loginRes.body.accessToken;

      // 1. Change password
      const changeRes = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'Demo1234!', newPassword: 'UpdatedSecurePass2026!' });
      expect(changeRes.status).toBe(200);
      expect(changeRes.body.ok).toBe(true);

      // 2. Old password should now fail login
      const failLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'Demo1234!' });
      expect(failLogin.status).toBe(401);

      // 3. New password should succeed login
      const succeedLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@acgt.test', password: 'UpdatedSecurePass2026!' });
      expect(succeedLogin.status).toBe(200);
      expect(succeedLogin.body).toHaveProperty('accessToken');

      // 4. Restore original password so tests remain repeatable
      const revertRes = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${succeedLogin.body.accessToken}`)
        .send({ oldPassword: 'UpdatedSecurePass2026!', newPassword: 'Demo1234!' });
      expect(revertRes.status).toBe(200);
    });
  });
});
