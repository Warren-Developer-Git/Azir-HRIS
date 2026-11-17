import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service.js';
import type { AuthUser } from '../auth/permissions.js';

const mockUser: AuthUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  employeeId: 'emp-1',
  email: 'warren@acgt.test',
  roles: ['EMPLOYEE'],
  permissions: new Set(['leave.file']),
};

describe('LeaveRequestsService Attachments (Task 5)', () => {
  let service: LeaveRequestsService;
  let txMock: {
    $executeRaw: ReturnType<typeof vi.fn>;
    employee: { findUnique: ReturnType<typeof vi.fn> };
    leaveType: { findUnique: ReturnType<typeof vi.fn> };
    holiday: { findMany: ReturnType<typeof vi.fn> };
    leaveRequest: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    user: { findMany: ReturnType<typeof vi.fn> };
  };
  let prismaMock: { withTenant: ReturnType<typeof vi.fn> };
  let auditMock: { record: ReturnType<typeof vi.fn> };
  let balancesMock: { summary: ReturnType<typeof vi.fn> };
  let clockMock: { now: ReturnType<typeof vi.fn> };
  let notificationsMock: { notify: ReturnType<typeof vi.fn> };
  let storageMock: {
    uploadFile: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    txMock = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      employee: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'emp-1',
          tenantId: 'tenant-1',
          firstName: 'Warren',
          lastName: 'Mallorca',
          status: 'ACTIVE',
          gender: 'MALE',
          maritalStatus: 'SINGLE',
          hireDate: new Date('2024-01-01'),
          manager: null,
        }),
      },
      leaveType: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'lt-1',
          active: true,
          name: 'Sick Leave',
          kind: 'YEARLY',
          defaultDays: 10,
          countingMode: 'WORKING_DAYS',
          eligibleGender: null,
          eligibleMaritalStatus: null,
          minServiceMonths: 0,
          requiresAttachment: false,
        }),
      },
      holiday: { findMany: vi.fn().mockResolvedValue([]) },
      leaveRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'lr-1',
          ...data,
          leaveType: { id: 'lt-1', name: 'Sick Leave' },
        })),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };

    prismaMock = {
      withTenant: vi.fn(async (_tenantId: string, fn: (tx: typeof txMock) => unknown) =>
        fn(txMock),
      ),
    };
    auditMock = { record: vi.fn().mockResolvedValue(undefined) };
    balancesMock = {
      summary: vi.fn().mockResolvedValue([{ leaveTypeId: 'lt-1', available: 10 }]),
    };
    clockMock = { now: vi.fn(() => new Date('2026-11-16T01:00:00Z')) };
    notificationsMock = { notify: vi.fn().mockResolvedValue(undefined) };
    storageMock = {
      uploadFile: vi.fn(),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };

    service = new LeaveRequestsService(
      prismaMock as any,
      auditMock as any,
      balancesMock as any,
      clockMock as any,
      notificationsMock as any,
      storageMock as any,
    );
  });

  it('uploadAttachment calls storageService with leave-attachment category and returns object metadata', async () => {
    storageMock.uploadFile.mockResolvedValue({
      key: 'tenants/tenant-1/leave-attachments/uuid-1.pdf',
      url: '/storage/download?key=tenants%2Ftenant-1%2Fleave-attachments%2Fuuid-1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 256,
      provider: 'LOCAL_DISK',
    });

    const file = {
      buffer: Buffer.from('%PDF-1.4\n'),
      mimetype: 'application/pdf',
      originalname: 'medcert.pdf',
    } as Express.Multer.File;

    const result = await service.uploadAttachment(mockUser, file);

    expect(storageMock.uploadFile).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      category: 'leave-attachment',
      buffer: file.buffer,
      mimeType: 'application/pdf',
      originalName: 'medcert.pdf',
    });
    expect(result.key).toBe('tenants/tenant-1/leave-attachments/uuid-1.pdf');
    expect(result.originalName).toBe('medcert.pdf');
  });

  it('rejects attachmentKey belonging to another tenant or outside leave-attachments', async () => {
    await expect(
      service.fileRequest(mockUser, {
        leaveTypeId: 'lt-1',
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        reason: 'Fever',
        attachmentKey: 'tenants/tenant-other/leave-attachments/secret.pdf',
        attachmentName: 'secret.pdf',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects leave filing when leaveType requiresAttachment is true and no attachmentKey is supplied', async () => {
    txMock.leaveType.findUnique.mockResolvedValue({
      id: 'lt-1',
      active: true,
      name: 'Sick Leave',
      kind: 'YEARLY',
      defaultDays: 10,
      countingMode: 'WORKING_DAYS',
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
      requiresAttachment: true,
    });

    await expect(
      service.fileRequest(mockUser, {
        leaveTypeId: 'lt-1',
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        reason: 'Medical checkup',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists valid tenant-scoped attachmentKey and attachmentName on LeaveRequest', async () => {
    txMock.leaveType.findUnique.mockResolvedValue({
      id: 'lt-1',
      active: true,
      name: 'Sick Leave',
      kind: 'YEARLY',
      defaultDays: 10,
      countingMode: 'WORKING_DAYS',
      eligibleGender: null,
      eligibleMaritalStatus: null,
      minServiceMonths: 0,
      requiresAttachment: true,
    });

    const created = await service.fileRequest(mockUser, {
      leaveTypeId: 'lt-1',
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      reason: 'Medical checkup',
      attachmentKey: 'tenants/tenant-1/leave-attachments/uuid-1.pdf',
      attachmentName: 'medcert.pdf',
    });

    expect(txMock.leaveRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachmentKey: 'tenants/tenant-1/leave-attachments/uuid-1.pdf',
          attachmentName: 'medcert.pdf',
        }),
      }),
    );
    expect(created.attachmentKey).toBe('tenants/tenant-1/leave-attachments/uuid-1.pdf');
    expect(created.attachmentName).toBe('medcert.pdf');
  });
});
