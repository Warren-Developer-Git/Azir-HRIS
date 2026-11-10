import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser } from '../auth/permissions.js';
import { CreateHolidayDto } from './dto/create-holiday.dto.js';
import { UpdateHolidayDto } from './dto/update-holiday.dto.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createHoliday(user: AuthUser, dto: CreateHolidayDto) {
    const holidayDate = new Date(`${dto.date}T00:00:00.000Z`);

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.holiday.findFirst({
        where: {
          tenantId: user.tenantId,
          date: holidayDate,
        },
      });

      if (existing) {
        throw new ConflictException('A holiday already exists on this date');
      }

      const created = await tx.holiday.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name.trim(),
          date: holidayDate,
          type: dto.type,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'Holiday',
        entityId: created.id,
        after: created,
      });

      return created;
    });
  }

  async updateHoliday(user: AuthUser, id: string, dto: UpdateHolidayDto) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Holiday not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.holiday.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Holiday not found');
      }

      const data: any = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.type !== undefined) data.type = dto.type;

      const updated = await tx.holiday.update({
        where: { id },
        data,
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'update',
        entity: 'Holiday',
        entityId: id,
        before: existing,
        after: updated,
      });

      return updated;
    });
  }

  async deleteHoliday(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Holiday not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.holiday.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Holiday not found');
      }

      await tx.holiday.delete({ where: { id } });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'delete',
        entity: 'Holiday',
        entityId: id,
        before: existing,
      });

      return { deleted: true };
    });
  }
}
