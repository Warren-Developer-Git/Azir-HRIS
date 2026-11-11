import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Notifications API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let managerToken: string;
  let employeeToken: string;
  let hrToken: string;
  let vlTypeId: string;
  let createdRequestId: string;

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

    managerToken = await getToken('manager@acme.test');
    employeeToken = await getToken('employee@acme.test');
    hrToken = await getToken('hr@acme.test');

    const typesRes = await request(app.getHttpServer())
      .get('/leave-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    const types = typesRes.body as Array<{ id: string; code: string }>;
    vlTypeId = types.find((t) => t.code === 'VL')!.id;

    // Employee files a request (Wed Nov 25 to Thu Nov 26, 2026)
    const fileRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: vlTypeId,
        startDate: '2026-11-25',
        endDate: '2026-11-26',
        reason: 'Rest and recreation',
      });
    createdRequestId = fileRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('initially employee has 0 unread notifications', async () => {
    const res = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it('manager receives a notification when employee files, employee receives notification when manager approves', async () => {
    // Check manager received notification about the filing
    const mgrNotifRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(mgrNotifRes.status).toBe(200);
    expect(mgrNotifRes.body.unread).toBeGreaterThanOrEqual(1);
    expect(mgrNotifRes.body.items[0].message).toContain('requested');

    // Manager approves
    await request(app.getHttpServer())
      .post(`/leave/requests/${createdRequestId}/decision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ decision: 'APPROVED', comment: 'Approved by manager' });

    // Employee should now have unread: 1 notification
    const empNotifRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(empNotifRes.status).toBe(200);
    expect(empNotifRes.body.unread).toBe(1);
    expect(empNotifRes.body.items.length).toBe(1);
    const notif = empNotifRes.body.items[0];
    expect(notif.readAt).toBeNull();
    expect(notif.message).toContain('approved');

    // Marking someone else's notification as read returns 404
    const foreignRes = await request(app.getHttpServer())
      .post(`/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${hrToken}`);

    expect(foreignRes.status).toBe(404);

    // Employee marks single notification as read
    const readRes = await request(app.getHttpServer())
      .post(`/notifications/${notif.id}/read`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.readAt).not.toBeNull();

    // Check unread is now 0
    const checkRes = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(checkRes.body.unread).toBe(0);
  });

  it('POST /notifications/read-all marks all unread notifications for current user', async () => {
    // HR approves the request -> generates another notification for employee
    await request(app.getHttpServer())
      .post(`/leave/requests/${createdRequestId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED', comment: 'Final HR approval' });

    // Check employee has 1 unread notification now
    const notifBefore = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(notifBefore.body.unread).toBe(1);

    // Call read-all
    const readAllRes = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.updated).toBe(1);

    // Check unread is 0
    const notifAfter = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(notifAfter.body.unread).toBe(0);
  });
});
