import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/permissions.js';

export interface NotifyInput {
  tenantId: string;
  recipientUserIds: string[];
  message: string;
  link?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(tx: Prisma.TransactionClient, input: NotifyInput): Promise<void> {
    if (!input.recipientUserIds || input.recipientUserIds.length === 0) {
      return;
    }

    const uniqueRecipientIds = [...new Set(input.recipientUserIds.filter(Boolean))];
    if (uniqueRecipientIds.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: uniqueRecipientIds.map((recipientId) => ({
        tenantId: input.tenantId,
        recipientId,
        message: input.message,
        link: input.link ?? null,
      })),
    });
  }

  async getUserNotifications(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const [items, unread] = await Promise.all([
        tx.notification.findMany({
          where: {
            tenantId: user.tenantId,
            recipientId: user.userId,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        tx.notification.count({
          where: {
            tenantId: user.tenantId,
            recipientId: user.userId,
            readAt: null,
          },
        }),
      ]);

      return { items, unread };
    });
  }

  async markAsRead(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.notification.findFirst({
        where: {
          id,
          tenantId: user.tenantId,
          recipientId: user.userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Notification not found');
      }

      if (existing.readAt) {
        return existing;
      }

      return tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    });
  }

  async markAllAsRead(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const res = await tx.notification.updateMany({
        where: {
          tenantId: user.tenantId,
          recipientId: user.userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      return { updated: res.count };
    });
  }
}
