import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import type { AuthUser } from '../auth/permissions.js';

const mockUser: AuthUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  employeeId: 'emp-1',
  email: 'warren@acgt.test',
  roles: ['EMPLOYEE'],
  permissions: new Set(),
};

describe('EmployeesService Avatar Storage (Task 4)', () => {
  let service: EmployeesService;
  let txMock: {
    employee: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let prismaMock: {
    withTenant: ReturnType<typeof vi.fn>;
  };
  let auditMock: {
    record: ReturnType<typeof vi.fn>;
  };
  let storageMock: {
    uploadFile: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    txMock = {
      employee: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };
    prismaMock = {
      withTenant: vi.fn(async (_tenantId: string, fn: (tx: typeof txMock) => unknown) =>
        fn(txMock),
      ),
    };
    auditMock = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    storageMock = {
      uploadFile: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };

    service = new EmployeesService(
      prismaMock as any,
      auditMock as any,
      storageMock as any,
    );
  });

  it('rejects missing file on uploadAvatar', async () => {
    await expect(service.uploadAvatar(mockUser, undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(storageMock.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads avatar, updates avatarUrl/avatarKey, records audit, and deletes old key', async () => {
    txMock.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      tenantId: 'tenant-1',
      avatarUrl: '/storage/public/tenant-1/avatars/old.png',
      avatarKey: 'public/tenant-1/avatars/old.png',
    });
    storageMock.uploadFile.mockResolvedValue({
      key: 'public/tenant-1/avatars/new-uuid.png',
      url: '/storage/public/tenant-1/avatars/new-uuid.png',
      mimeType: 'image/png',
      sizeBytes: 128,
      provider: 'LOCAL_DISK',
    });
    txMock.employee.update.mockResolvedValue({
      id: 'emp-1',
      avatarUrl: '/storage/public/tenant-1/avatars/new-uuid.png',
      avatarKey: 'public/tenant-1/avatars/new-uuid.png',
    });

    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimetype: 'image/png',
      originalname: 'photo.png',
    } as Express.Multer.File;

    const result = await service.uploadAvatar(mockUser, file);

    expect(storageMock.uploadFile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      category: 'avatar',
      buffer: file.buffer,
      mimeType: 'image/png',
      originalName: 'photo.png',
    });
    expect(txMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emp-1' },
        data: {
          avatarUrl: '/storage/public/tenant-1/avatars/new-uuid.png',
          avatarKey: 'public/tenant-1/avatars/new-uuid.png',
        },
      }),
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'uploadAvatar',
        entity: 'Employee',
        entityId: 'emp-1',
      }),
    );
    expect(storageMock.deleteObject).toHaveBeenCalledWith('public/tenant-1/avatars/old.png');
    expect(result.avatarKey).toBe('public/tenant-1/avatars/new-uuid.png');
  });

  it('cleans up newly uploaded file if employee lookup throws NotFoundException', async () => {
    txMock.employee.findFirst.mockResolvedValue(null);
    storageMock.uploadFile.mockResolvedValue({
      key: 'public/tenant-1/avatars/orphan.png',
      url: '/storage/public/tenant-1/avatars/orphan.png',
      mimeType: 'image/png',
      sizeBytes: 64,
      provider: 'LOCAL_DISK',
    });

    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimetype: 'image/png',
      originalname: 'photo.png',
    } as Express.Multer.File;

    await expect(service.uploadAvatar(mockUser, file)).rejects.toThrow(
      NotFoundException,
    );
    expect(storageMock.deleteObject).toHaveBeenCalledWith(
      'public/tenant-1/avatars/orphan.png',
    );
  });

  it('removes avatarUrl and avatarKey, records audit, and deletes old object', async () => {
    txMock.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      tenantId: 'tenant-1',
      avatarUrl: '/storage/public/tenant-1/avatars/old.png',
      avatarKey: 'public/tenant-1/avatars/old.png',
    });
    txMock.employee.update.mockResolvedValue({
      id: 'emp-1',
      avatarUrl: null,
      avatarKey: null,
    });

    const result = await service.removeAvatar(mockUser);

    expect(txMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'emp-1' },
        data: { avatarUrl: null, avatarKey: null },
      }),
    );
    expect(auditMock.record).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        action: 'removeAvatar',
        entity: 'Employee',
        entityId: 'emp-1',
      }),
    );
    expect(storageMock.deleteObject).toHaveBeenCalledWith('public/tenant-1/avatars/old.png');
    expect(result.avatarUrl).toBeNull();
  });
});
