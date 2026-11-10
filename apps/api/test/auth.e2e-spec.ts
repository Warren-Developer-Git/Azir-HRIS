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
      .send({ email: 'employee@acme.test', password: 'Demo1234!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user).toMatchObject({
      email: 'employee@acme.test',
      roles: ['EMPLOYEE'],
      tenantName: 'Acme Manila Corp',
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
      .send({ email: 'employee@acme.test', password: 'WrongPassword999!' });

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
      where: { email: 'dev1@acme.test' },
      data: { active: false },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'dev1@acme.test', password: 'Demo1234!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');

    // Restore dev1 active state
    await ownerDb.user.updateMany({
      where: { email: 'dev1@acme.test' },
      data: { active: true },
    });
  });

  it('GET /auth/me returns 401 without token and 200 with valid token', async () => {
    const unauthRes = await request(app.getHttpServer()).get('/auth/me');
    expect(unauthRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'hr@acme.test', password: 'Demo1234!' });

    const authRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(authRes.status).toBe(200);
    expect(authRes.body.email).toBe('hr@acme.test');
    expect(authRes.body.roles).toContain('HR');
  });

  it('POST /auth/refresh returns a new accessToken using the refresh cookie', async () => {
    const noCookieRes = await request(app.getHttpServer()).post('/auth/refresh');
    expect(noCookieRes.status).toBe(401);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@acme.test', password: 'Demo1234!' });

    const cookieHeader = loginRes.headers['set-cookie'];

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body.user.email).toBe('admin@acme.test');
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
});
