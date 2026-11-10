import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';

@Controller()
export class SettingsReadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leave-types')
  async getLeaveTypes(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: any = { tenantId: user.tenantId };
      if (includeInactive !== 'true') {
        where.active = true;
      }
      return tx.leaveType.findMany({
        where,
        orderBy: { code: 'asc' },
      });
    });
  }

  @Get('holidays')
  async getHolidays(
    @CurrentUser() user: AuthUser,
    @Query('year') yearStr?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: any = { tenantId: user.tenantId };
      if (yearStr) {
        const year = parseInt(yearStr, 10);
        where.date = {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31)),
        };
      }
      return tx.holiday.findMany({
        where,
        orderBy: { date: 'asc' },
      });
    });
  }

  @Get('departments')
  async getDepartments(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: any = { tenantId: user.tenantId };
      if (includeInactive !== 'true') {
        where.active = true;
      }
      return tx.department.findMany({
        where,
        orderBy: { name: 'asc' },
      });
    });
  }
}
