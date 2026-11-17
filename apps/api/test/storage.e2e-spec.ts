import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const PNG_MAGIC_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf-8');
const EXE_SPOOF_BYTES = Buffer.from('MZ\x90\x00fake-executable', 'utf-8');

describe('Storage API (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let adminToken: string;
  let employeeToken: string;
  let bynEmployeeToken: string;
  let requiredAttachmentTypeId: string;

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
      return res.body.accessToken as string;
    }

    adminToken = await getToken('admin@acgt.test');
    employeeToken = await getToken('employee@acgt.test');
    bynEmployeeToken = await getToken('employee@bayanihan.test');

    // Grant yearly balances so employee can file leave
    await request(app.getHttpServer())
      .post('/leave/balances/grant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ year: new Date().getUTCFullYear() });

    // Mark SL leave type as requiring attachment for E2E verification
    const sl = await ownerDb.leaveType.findFirst({
      where: { code: 'SL' },
    });
    if (!sl) {
      throw new Error('Expected seeded SL leave type');
    }
    await ownerDb.leaveType.update({
      where: { id: sl.id },
      data: { requiresAttachment: true },
    });
    requiredAttachmentTypeId = sl.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('GET /storage/status returns LOCAL_DISK in hermetic E2E environment', async () => {
    const res = await request(app.getHttpServer())
      .get('/storage/status')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('LOCAL_DISK');
  });

  it('POST /me/avatar rejects spoofed magic bytes and accepts real PNG, then serves & deletes', async () => {
    const spoofRes = await request(app.getHttpServer())
      .post('/me/avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', EXE_SPOOF_BYTES, {
        filename: 'fake.png',
        contentType: 'image/png',
      });
    expect(spoofRes.status).toBe(400);

    const uploadRes = await request(app.getHttpServer())
      .post('/me/avatar')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', PNG_MAGIC_BYTES, {
        filename: 'avatar.png',
        contentType: 'image/png',
      });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.avatarUrl).toMatch(/^\/storage\/public\/.+\/avatars\/.+\.png$/);
    expect(uploadRes.body.avatarKey).toMatch(/^public\/.+\/avatars\/.+\.png$/);

    const publicFetch = await request(app.getHttpServer()).get(
      uploadRes.body.avatarUrl,
    );
    expect(publicFetch.status).toBe(200);
    expect(publicFetch.headers['x-content-type-options']).toBe('nosniff');

    const deleteRes = await request(app.getHttpServer())
      .delete('/me/avatar')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.avatarUrl).toBeNull();
    expect(deleteRes.body.avatarKey).toBeNull();
  });

  it('POST /leave/attachments + download isolation + requiresAttachment enforcement', async () => {
    const attachmentRes = await request(app.getHttpServer())
      .post('/leave/attachments')
      .set('Authorization', `Bearer ${employeeToken}`)
      .attach('file', PDF_BYTES, {
        filename: 'medcert.pdf',
        contentType: 'application/pdf',
      });
    expect(attachmentRes.status).toBe(201);
    expect(attachmentRes.body.key).toMatch(
      /^tenants\/.+\/leave-attachments\/.+\.pdf$/,
    );

    const key = attachmentRes.body.key as string;

    // Owner tenant can download
    const ownDownload = await request(app.getHttpServer())
      .get(`/storage/download?key=${encodeURIComponent(key)}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(ownDownload.status).toBe(200);
    expect(ownDownload.headers['x-content-type-options']).toBe('nosniff');

    // Cross-tenant download is forbidden
    const crossDownload = await request(app.getHttpServer())
      .get(`/storage/download?key=${encodeURIComponent(key)}`)
      .set('Authorization', `Bearer ${bynEmployeeToken}`);
    expect(crossDownload.status).toBe(403);

    // Pick a future weekday date string for leave filing
    const now = new Date();
    const day = new Date(now.getTime() + 7 * 86400_000);
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
      day.setUTCDate(day.getUTCDate() + 1);
    }
    const dateStr = day.toISOString().slice(0, 10);

    // Leave type requiring attachment fails without attachmentKey
    const missingAttachRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: requiredAttachmentTypeId,
        startDate: dateStr,
        endDate: dateStr,
        reason: 'Medical checkup',
      });
    expect(missingAttachRes.status).toBe(400);

    // Succeeds when tenant-scoped attachmentKey is provided
    const validFilingRes = await request(app.getHttpServer())
      .post('/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: requiredAttachmentTypeId,
        startDate: dateStr,
        endDate: dateStr,
        reason: 'Medical checkup',
        attachmentKey: key,
        attachmentName: 'medcert.pdf',
      });
    expect(validFilingRes.status).toBe(201);
    expect(validFilingRes.body.attachmentKey).toBe(key);
    expect(validFilingRes.body.attachmentName).toBe('medcert.pdf');
  });
});
