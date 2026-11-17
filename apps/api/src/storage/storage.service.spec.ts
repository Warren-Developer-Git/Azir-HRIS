import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service.js';

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_HEADER = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj', 'utf8');

describe('StorageService', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_STORAGE_BUCKET;
    delete process.env.LOCAL_UPLOAD_DIR;

    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function makeLocalService() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hrms-storage-'));
    tempDirs.push(dir);
    process.env.LOCAL_UPLOAD_DIR = dir;
    return { svc: new StorageService(), dir };
  }

  it('rejects spoofed executable/text content claiming image/jpeg via magic bytes', async () => {
    const { svc } = await makeLocalService();
    const fakeExe = Buffer.from('MZ\x90\x00This is not a JPEG');

    await expect(
      svc.uploadFile({
        tenantId: 'tenant-1',
        category: 'avatar',
        buffer: fakeExe,
        mimeType: 'image/jpeg',
        originalName: 'malware.jpg',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects disallowed MIME types and files exceeding category size caps', async () => {
    const { svc } = await makeLocalService();

    // PDF not allowed for avatars
    await expect(
      svc.uploadFile({
        tenantId: 'tenant-1',
        category: 'avatar',
        buffer: PDF_HEADER,
        mimeType: 'application/pdf',
        originalName: 'doc.pdf',
      }),
    ).rejects.toThrow(BadRequestException);

    // > 2 MB avatar rejected
    const oversizedAvatar = Buffer.concat([
      PNG_HEADER,
      Buffer.alloc(2 * 1024 * 1024 + 10),
    ]);
    await expect(
      svc.uploadFile({
        tenantId: 'tenant-1',
        category: 'avatar',
        buffer: oversizedAvatar,
        mimeType: 'image/png',
        originalName: 'huge.png',
      }),
    ).rejects.toThrow(BadRequestException);

    // > 5 MB attachment rejected
    const oversizedPdf = Buffer.concat([
      PDF_HEADER,
      Buffer.alloc(5 * 1024 * 1024 + 10),
    ]);
    await expect(
      svc.uploadFile({
        tenantId: 'tenant-1',
        category: 'leave-attachment',
        buffer: oversizedPdf,
        mimeType: 'application/pdf',
        originalName: 'huge.pdf',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores, reads, and deletes files in LOCAL_DISK fallback and blocks path traversal', async () => {
    const { svc } = await makeLocalService();
    expect(svc.getProviderMode()).toBe('LOCAL_DISK');

    const avatar = await svc.uploadFile({
      tenantId: 'tenant-a',
      category: 'avatar',
      buffer: JPEG_HEADER,
      mimeType: 'image/jpeg',
      originalName: '../../evil.jpg',
    });

    expect(avatar.provider).toBe('LOCAL_DISK');
    expect(avatar.key).toMatch(/^public\/tenant-a\/avatars\/[0-9a-f-]+\.jpg$/);
    expect(avatar.url).toBe(`/api/storage/${avatar.key}`);

    const readBack = await svc.readObject(avatar.key);
    expect(readBack.buffer.equals(JPEG_HEADER)).toBe(true);
    expect(readBack.contentType).toBe('image/jpeg');

    await expect(svc.readObject('../etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.deleteObject('public/../../secret')).rejects.toThrow(
      BadRequestException,
    );

    await svc.deleteObject(avatar.key);
    await expect(svc.readObject(avatar.key)).rejects.toThrow(NotFoundException);
  });

  it('uploads, reads, and deletes objects via Supabase Storage REST API when configured', async () => {
    process.env.SUPABASE_URL = 'https://demo-proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-secret-key';
    process.env.SUPABASE_STORAGE_BUCKET = 'hrms-files';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Key: 'hrms-files/ok' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(PDF_HEADER, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = new StorageService();
    expect(svc.getProviderMode()).toBe('SUPABASE_STORAGE');

    const uploaded = await svc.uploadFile({
      tenantId: 'tenant-supa',
      category: 'leave-attachment',
      buffer: PDF_HEADER,
      mimeType: 'application/pdf',
      originalName: 'medcert.pdf',
    });

    expect(uploaded.provider).toBe('SUPABASE_STORAGE');
    expect(uploaded.key).toMatch(
      /^tenants\/tenant-supa\/leave-attachments\/[0-9a-f-]+\.pdf$/,
    );
    expect(uploaded.url).toContain('/api/storage/download?key=');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://demo-proj.supabase.co/storage/v1/object/hrms-files/${uploaded.key}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer srv-secret-key',
          'Content-Type': 'application/pdf',
        }),
      }),
    );

    const downloaded = await svc.readObject(uploaded.key);
    expect(downloaded.contentType).toBe('application/pdf');
    expect(downloaded.buffer.equals(PDF_HEADER)).toBe(true);

    await svc.deleteObject(uploaded.key);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `https://demo-proj.supabase.co/storage/v1/object/hrms-files/${uploaded.key}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer srv-secret-key',
        }),
      }),
    );
  });

  it('sends apikey header without Authorization Bearer when using modern sb_secret_ keys', async () => {
    process.env.SUPABASE_URL = 'https://demo-proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_demo_key_123';
    process.env.SUPABASE_STORAGE_BUCKET = 'hrms-files';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Key: 'hrms-files/ok' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(PNG_HEADER, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const svc = new StorageService();
    const uploaded = await svc.uploadFile({
      tenantId: 'tenant-supa',
      category: 'avatar',
      buffer: PNG_HEADER,
      mimeType: 'image/png',
      originalName: 'avatar.png',
    });

    await svc.readObject(uploaded.key);
    await svc.deleteObject(uploaded.key);

    for (const callIndex of [0, 1, 2]) {
      const headers = fetchMock.mock.calls[callIndex][1].headers as Record<string, string>;
      expect(headers.apikey).toBe('sb_secret_demo_key_123');
      expect(headers.Authorization).toBeUndefined();
    }
  });
});
