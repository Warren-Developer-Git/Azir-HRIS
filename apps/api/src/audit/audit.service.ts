import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface AuditRecordInput {
  tenantId: string;
  actorId: string;
  action: 'create' | 'update' | 'deactivate' | 'delete' | 'decide' | 'cancel' | string;
  entity: string;
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}

@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, input: AuditRecordInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: input.before ?? Prisma.DbNull,
        after: input.after ?? Prisma.DbNull,
      },
    });
  }

  async list(tx: Prisma.TransactionClient, tenantId: string, limit = 50) {
    return tx.auditLog.findMany({
      where: { tenantId },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
