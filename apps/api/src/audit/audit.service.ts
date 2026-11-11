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

export interface AuditListOptions {
  entity?: string;
  before?: string;
  limit?: number;
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

  async list(
    tx: Prisma.TransactionClient,
    tenantId: string,
    options?: AuditListOptions | number,
  ) {
    const where: any = { tenantId };
    let limit = 50;

    if (typeof options === 'number') {
      limit = options;
    } else if (options) {
      if (options.entity) {
        where.entity = options.entity;
      }
      if (options.before) {
        where.createdAt = { lt: new Date(options.before) };
      }
      if (options.limit) {
        limit = options.limit;
      }
    }

    return tx.auditLog.findMany({
      where,
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
