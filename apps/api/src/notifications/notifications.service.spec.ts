import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import type { EmailService } from './email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';

describe('NotificationsService.notify', () => {
  const prismaStub = {} as PrismaService;
  const auditStub = {} as AuditService;

  it('creates deduplicated notifications and skips email dispatch when no provider is configured', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const findMany = vi.fn();
    const tx = {
      notification: { createMany },
      user: { findMany },
    } as any;

    const sendEmail = vi.fn();
    const emailService = {
      isConfigured: vi.fn().mockReturnValue(false),
      sendEmail,
      resolveTargetEmail: vi.fn(),
    } as unknown as EmailService;

    const svc = new NotificationsService(prismaStub, emailService, auditStub);
    await svc.notify(tx, {
      tenantId: 'tenant-1',
      recipientUserIds: ['u1', 'u2', 'u1'],
      message: 'Your leave request was approved.',
      link: '/leave/123',
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-1',
          recipientId: 'u1',
          message: 'Your leave request was approved.',
          link: '/leave/123',
        },
        {
          tenantId: 'tenant-1',
          recipientId: 'u2',
          message: 'Your leave request was approved.',
          link: '/leave/123',
        },
      ],
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('dispatches workflow emails when configured and isolates provider rejections', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      {
        email: 'employee@acgt.test',
        tenant: { name: 'Azir Company Global Tech' },
        employee: { firstName: 'Gabriela', lastName: 'Silang' },
      },
    ]);
    const tx = {
      notification: { createMany },
      user: { findMany },
    } as any;

    const sendEmail = vi.fn().mockRejectedValue(new Error('SMTP unreachable'));
    const emailService = {
      isConfigured: vi.fn().mockReturnValue(true),
      resolveTargetEmail: vi.fn().mockReturnValue({
        targetEmail: 'demo@gmail.com',
        routedOverrideNote: 'Demo delivery routed',
      }),
      sendEmail,
    } as unknown as EmailService;

    const svc = new NotificationsService(prismaStub, emailService, auditStub);

    await expect(
      svc.notify(tx, {
        tenantId: 'tenant-1',
        recipientUserIds: ['u1'],
        message: 'Payroll posted for Nov 1-15.',
        link: '/payroll',
      }),
    ).resolves.toBeUndefined();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'employee@acgt.test',
        recipientLabel: 'Gabriela Silang',
        subject: expect.stringContaining('Payroll posted'),
      }),
    );
  });
});
