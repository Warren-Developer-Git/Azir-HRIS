import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/permissions.js';
import { StorageController } from './storage.controller.js';
import type { StorageService } from './storage.service.js';

describe('StorageController', () => {
  const tenantUser: AuthUser = {
    userId: 'user-1',
    employeeId: 'emp-1',
    tenantId: '11111111-1111-4111-8111-111111111111',
    email: 'emp@acgt.test',
    roles: ['EMPLOYEE'],
  };

  function makeResMock() {
    const headers: Record<string, string> = {};
    const send = vi.fn();
    return {
      headers,
      send,
      res: {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
        send,
      } as any,
    };
  }

  it('rejects cross-tenant object keys on protected download with ForbiddenException', async () => {
    const storageStub = {
      readObject: vi.fn(),
      getProviderMode: vi.fn().mockReturnValue('LOCAL_DISK'),
    } as unknown as StorageService;

    const controller = new StorageController(storageStub);
    const { res } = makeResMock();

    await expect(
      controller.downloadProtectedFile(
        tenantUser,
        'tenants/22222222-2222-4222-8222-222222222222/leave-attachments/med.pdf',
        undefined,
        res,
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      controller.downloadProtectedFile(tenantUser, '', undefined, res),
    ).rejects.toThrow(BadRequestException);
  });

  it('streams tenant-owned attachment with nosniff and attachment headers', async () => {
    const pdfBuf = Buffer.from('%PDF-1.7 test');
    const storageStub = {
      readObject: vi.fn().mockResolvedValue({
        buffer: pdfBuf,
        contentType: 'application/pdf',
      }),
      getProviderMode: vi.fn().mockReturnValue('LOCAL_DISK'),
    } as unknown as StorageService;

    const controller = new StorageController(storageStub);
    const { res, headers, send } = makeResMock();
    const validKey = `tenants/${tenantUser.tenantId}/leave-attachments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;

    await controller.downloadProtectedFile(
      tenantUser,
      validKey,
      'medical cert.pdf',
      res,
    );

    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-disposition']).toContain('attachment');
    expect(headers['content-disposition']).toContain('medical_cert.pdf');
    expect(send).toHaveBeenCalledWith(pdfBuf);
  });

  it('serves validated public avatars and rejects invalid avatar filenames', async () => {
    const jpgBuf = Buffer.from([0xff, 0xd8, 0xff]);
    const storageStub = {
      readObject: vi.fn().mockResolvedValue({
        buffer: jpgBuf,
        contentType: 'image/jpeg',
      }),
      getProviderMode: vi.fn().mockReturnValue('LOCAL_DISK'),
    } as unknown as StorageService;

    const controller = new StorageController(storageStub);
    const { res, headers, send } = makeResMock();

    await expect(
      controller.servePublicAvatar(
        tenantUser.tenantId,
        '../../secret.txt',
        res,
      ),
    ).rejects.toThrow(BadRequestException);

    await controller.servePublicAvatar(
      tenantUser.tenantId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
      res,
    );

    expect(headers['content-type']).toBe('image/jpeg');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(send).toHaveBeenCalledWith(jpgBuf);
    expect(controller.getStatus()).toEqual({ provider: 'LOCAL_DISK' });
  });
});
