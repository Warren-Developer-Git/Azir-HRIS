import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser } from '../auth/permissions.js';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto.js';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createLeaveType(user: AuthUser, dto: CreateLeaveTypeDto) {
    const code = dto.code.trim().toUpperCase();

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.leaveType.findFirst({
        where: { tenantId: user.tenantId, code },
      });

      if (existing) {
        throw new ConflictException('Leave type code already exists');
      }

      const created = await tx.leaveType.create({
        data: {
          tenantId: user.tenantId,
          code,
          name: dto.name.trim(),
          kind: dto.kind,
          defaultDays: dto.defaultDays,
          countingMode: dto.countingMode,
          eligibleGender: dto.eligibleGender ?? null,
          eligibleMaritalStatus: dto.eligibleMaritalStatus ?? null,
          minServiceMonths: dto.minServiceMonths ?? 0,
          active: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'LeaveType',
        entityId: created.id,
        after: created,
      });

      return created;
    });
  }

  async updateLeaveType(user: AuthUser, id: string, dto: UpdateLeaveTypeDto) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Leave type not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.leaveType.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Leave type not found');
      }

      const data: any = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.kind !== undefined) data.kind = dto.kind;
      if (dto.defaultDays !== undefined) data.defaultDays = dto.defaultDays;
      if (dto.countingMode !== undefined) data.countingMode = dto.countingMode;
      if (dto.eligibleGender !== undefined) data.eligibleGender = dto.eligibleGender;
      if (dto.eligibleMaritalStatus !== undefined) data.eligibleMaritalStatus = dto.eligibleMaritalStatus;
      if (dto.minServiceMonths !== undefined) data.minServiceMonths = dto.minServiceMonths;

      const updated = await tx.leaveType.update({
        where: { id },
        data,
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'update',
        entity: 'LeaveType',
        entityId: id,
        before: existing,
        after: updated,
      });

      return updated;
    });
  }

  async deleteLeaveType(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Leave type not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.leaveType.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Leave type not found');
      }

      const [requestsCount, ledgerCount] = await Promise.all([
        tx.leaveRequest.count({
          where: { tenantId: user.tenantId, leaveTypeId: id },
        }),
        tx.leaveLedgerEntry.count({
          where: { tenantId: user.tenantId, leaveTypeId: id },
        }),
      ]);

      if (requestsCount === 0 && ledgerCount === 0) {
        await tx.leaveType.delete({ where: { id } });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'delete',
          entity: 'LeaveType',
          entityId: id,
          before: existing,
        });

        return { deleted: true };
      } else {
        const deactivated = await tx.leaveType.update({
          where: { id },
          data: { active: false },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'deactivate',
          entity: 'LeaveType',
          entityId: id,
          before: existing,
          after: deactivated,
        });

        return { deactivated: true };
      }
    });
  }
}
