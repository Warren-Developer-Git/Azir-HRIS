import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface NotifyInput {
  tenantId: string;
  recipientUserIds: string[];
  message: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
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
}
