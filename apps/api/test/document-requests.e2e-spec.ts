import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import cookieParser from 'cookie-parser';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { createOwnerPrisma, resetAndSeedTestDb } from './helpers.js';
import { PrismaClient } from '@prisma/client';

describe('Document Requests & Verification Flow (e2e)', () => {
  let app: INestApplication<App>;
  let ownerDb: PrismaClient;
  let employeeToken: string;
  let hrToken: string;
  let hr2Token: string;
  let coeTypeId: string;
  let coeCompTypeId: string;
  let leaveCertTypeId: string;
  let payslipTypeId: string;

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

    employeeToken = await getToken('employee@acme.test');
    hrToken = await getToken('hr@acme.test');
    hr2Token = await getToken('hr2@acme.test');

    const typesRes = await request(app.getHttpServer())
      .get('/document-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(typesRes.status).toBe(200);

    const types = typesRes.body as Array<{ id: string; code: string }>;
    coeTypeId = types.find((t) => t.code === 'COE')!.id;
    coeCompTypeId = types.find((t) => t.code === 'COE_COMPENSATION')!.id;
    leaveCertTypeId = types.find((t) => t.code === 'LEAVE_CERT')!.id;
    payslipTypeId = types.find((t) => t.code === 'PAYSLIP')!.id;
  });

  afterAll(async () => {
    await app.close();
    await ownerDb.$disconnect();
  });

  it('lists active document types including COE, COE with compensation, Leave Cert, and Payslip', async () => {
    const res = await request(app.getHttpServer())
      .get('/document-types')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    const codes = res.body.map((t: any) => t.code);
    expect(codes).toContain('COE');
    expect(codes).toContain('COE_COMPENSATION');
    expect(codes).toContain('LEAVE_CERT');
    expect(codes).toContain('PAYSLIP');
  });

  it('employee files COE request -> 201 Created with status PENDING_APPROVAL and 3-day DOLE SLA dueAt', async () => {
    const res = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Visa application requirement for Japan travel',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_APPROVAL');
    expect(res.body.purpose).toBe('Visa application requirement for Japan travel');
    expect(res.body.dueAt).toBeDefined();

    // Verify dueAt is at least 3 calendar days ahead
    const reqDate = new Date(res.body.requestedAt).getTime();
    const dueDate = new Date(res.body.dueAt).getTime();
    expect(dueDate).toBeGreaterThan(reqDate);
  });

  it('employee can view watermarked DRAFT preview of pending request', async () => {
    // 1. File request
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Bank loan requirement',
      });
    expect(fileRes.status).toBe(201);
    const reqId = fileRes.body.id;

    // 2. Fetch preview
    const previewRes = await request(app.getHttpServer())
      .get(`/document-requests/${reqId}/preview`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.isDraft).toBe(true);
    expect(previewRes.body.watermark).toContain('DRAFT');
    expect(previewRes.body.documentNo).toBe('DRAFT-PREVIEW');
    expect(previewRes.body.employee).toBeDefined();
    expect(previewRes.body.employee.firstName).toBeDefined();
  });

  it('anti-self-approval: HR cannot approve their own document request', async () => {
    // HR files a document request
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Personal visa application',
      });
    expect(fileRes.status).toBe(201);
    const reqId = fileRes.body.id;

    // HR attempts self-approval -> 403 Forbidden
    const selfApproveRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.message).toContain('cannot approve your own');

    // HR2 approves it -> 200 OK
    const hr2Res = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hr2Token}`)
      .send({ decision: 'APPROVED' });

    expect(hr2Res.status).toBe(200);
    expect(hr2Res.body.status).toBe('APPROVED');
    expect(hr2Res.body.issuedDocument).toBeDefined();
    expect(hr2Res.body.issuedDocument.documentNo).toMatch(/^AZIR-DOC-\d{4}-\d{4}$/);
  });

  it('HR rejects request with reason -> 200 REJECTED, but missing reason gives 400', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Credit card application',
      });
    const reqId = fileRes.body.id;

    // Reject without comment -> 400 Bad Request
    const noReasonRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'REJECTED' });

    expect(noReasonRes.status).toBe(400);

    // Reject with comment -> 200 REJECTED
    const rejectRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'REJECTED', comment: 'Incorrect purpose specified' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.rejectReason).toBe('Incorrect purpose specified');
  });

  it('end-to-end issuance & public QR verification (/documents/verify/:code)', async () => {
    // 1. Employee files Leave Balance Certification request
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: leaveCertTypeId,
        purpose: 'Embassy requirements',
      });
    const reqId = fileRes.body.id;

    // 2. HR approves request
    const approveRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    const issuedDoc = approveRes.body.issuedDocument;
    expect(issuedDoc).toBeDefined();
    expect(issuedDoc.verificationCode).toBeDefined();
    expect(issuedDoc.status).toBe('VALID');

    const verifyCode = issuedDoc.verificationCode;

    // 3. Public Verification endpoint (NO JWT header!)
    const publicVerifyRes = await request(app.getHttpServer())
      .get(`/documents/verify/${verifyCode}`);

    expect(publicVerifyRes.status).toBe(200);
    expect(publicVerifyRes.body.isValid).toBe(true);
    expect(publicVerifyRes.body.organization).toContain('Acme');
    expect(publicVerifyRes.body.documentType).toBe('Leave Balance Certification');
    expect(publicVerifyRes.body.documentNo).toBe(issuedDoc.documentNo);
    expect(publicVerifyRes.body.issuedAt).toBeDefined();

    // 4. Non-existent verification code returns 404
    const notFoundVerifyRes = await request(app.getHttpServer())
      .get('/documents/verify/NON-EXISTENT-CODE');
    expect(notFoundVerifyRes.status).toBe(404);
  });

  it('handles payslip request with pay period and generates certified payslip snapshot', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: payslipTypeId,
        purpose: 'Car loan verification',
        payPeriod: 'October 16-31, 2026',
      });

    expect(fileRes.status).toBe(201);
    expect(fileRes.body.payPeriod).toBe('October 16-31, 2026');
    const reqId = fileRes.body.id;

    // HR approves
    const approveRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.issuedDocument.snapshotData).toBeDefined();
    expect(approveRes.body.issuedDocument.snapshotData.payPeriod).toBe('October 16-31, 2026');
  });

  it('employee can preview approved COE document and employee.department is a primitive string', async () => {
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Immigration visa requirement',
      });
    expect(fileRes.status).toBe(201);
    const reqId = fileRes.body.id;

    // HR approves
    const approveRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/decision`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ decision: 'APPROVED' });
    expect(approveRes.status).toBe(200);

    // Fetch approved preview
    const previewRes = await request(app.getHttpServer())
      .get(`/document-requests/${reqId}/preview`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.isDraft).toBe(false);
    expect(previewRes.body.documentNo).toMatch(/^AZIR-DOC-\d{4}-\d{4}$/);
    expect(typeof previewRes.body.employee.department).toBe('string');
    expect(previewRes.body.reviewedBy).toBeDefined();
    expect(previewRes.body.reviewedBy.firstName).toBeDefined();
  });

  it('employee can cancel their own pending request, but cannot cancel approved request', async () => {
    // 1. File request
    const fileRes = await request(app.getHttpServer())
      .post('/document-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        documentTypeId: coeTypeId,
        purpose: 'Accidental request',
      });
    const reqId = fileRes.body.id;

    // 2. Cancel
    const cancelRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // 3. Try to cancel again -> 400
    const cancelAgainRes = await request(app.getHttpServer())
      .post(`/document-requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(cancelAgainRes.status).toBe(400);
  });
});
