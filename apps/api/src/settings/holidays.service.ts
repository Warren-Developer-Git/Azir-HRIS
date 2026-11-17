import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser } from '../auth/permissions.js';
import { CreateHolidayDto } from './dto/create-holiday.dto.js';
import { UpdateHolidayDto } from './dto/update-holiday.dto.js';
import { SyncHolidaysDto } from './dto/sync-holidays.dto.js';
import {
  PublicHolidayApiService,
  classifyPhilippineHolidayType,
} from './public-holiday-api.service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly publicHolidayApi: PublicHolidayApiService,
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

  async previewExternalHolidays(dto: SyncHolidaysDto) {
    const year = dto.year ?? new Date().getFullYear();
    const countryCode = (dto.countryCode ?? 'PH').trim().toUpperCase();

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be an integer between 2000 and 2100');
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException('countryCode must be a 2-letter ISO code');
    }

    const items = await this.publicHolidayApi.fetchPublicHolidays(
      year,
      countryCode,
    );

    const uniqueByDate = new Map<
      string,
      {
        date: string;
        name: string;
        localName?: string;
        type: 'REGULAR' | 'SPECIAL';
      }
    >();
    for (const item of items) {
      if (!uniqueByDate.has(item.date)) {
        uniqueByDate.set(item.date, {
          date: item.date,
          name: item.name,
          localName: item.localName,
          type: classifyPhilippineHolidayType(item.name),
        });
      }
    }

    return {
      source: 'Nager.Date Public Holidays API',
      year,
      countryCode,
      count: uniqueByDate.size,
      holidays: Array.from(uniqueByDate.values()),
    };
  }

  async syncFromExternalApi(user: AuthUser, dto: SyncHolidaysDto) {
    const preview = await this.previewExternalHolidays(dto);

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const startOfYear = new Date(Date.UTC(preview.year, 0, 1));
      const endOfYear = new Date(Date.UTC(preview.year, 11, 31));

      const existingRows = await tx.holiday.findMany({
        where: {
          tenantId: user.tenantId,
          date: { gte: startOfYear, lte: endOfYear },
        },
        select: { date: true },
      });

      const existingDates = new Set(
        existingRows.map((row) => row.date.toISOString().slice(0, 10)),
      );

      const toInsert = preview.holidays.filter(
        (h) => !existingDates.has(h.date),
      );

      const createdHolidays = [];
      for (const item of toInsert) {
        const created = await tx.holiday.create({
          data: {
            tenantId: user.tenantId,
            name: item.name,
            date: new Date(`${item.date}T00:00:00.000Z`),
            type: item.type,
          },
        });
        createdHolidays.push(created);
      }

      const skippedCount = preview.holidays.length - createdHolidays.length;

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'sync',
        entity: 'Holiday',
        entityId: createdHolidays[0]?.id ?? user.tenantId,
        after: {
          source: preview.source,
          year: preview.year,
          countryCode: preview.countryCode,
          fetchedCount: preview.holidays.length,
          createdCount: createdHolidays.length,
          skippedCount,
        },
      });

      return {
        source: preview.source,
        year: preview.year,
        countryCode: preview.countryCode,
        fetchedCount: preview.holidays.length,
        createdCount: createdHolidays.length,
        skippedCount,
        createdHolidays,
      };
    });
  }
}
