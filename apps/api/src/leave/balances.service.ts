import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Clock } from './clock.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';
import { isEligibleForGrant, todayInManila } from './leave-rules.js';
import { CreateBalanceAdjustmentDto } from '../employees/dto/create-balance-adjustment.dto.js';

export interface LeaveBalanceSummary {
  leaveTypeId: string;
  code: string;
  name: string;
  balance: number;
  pending: number;
  available: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly clock: Clock,
  ) {}

  async summary(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    year: number,
  ): Promise<LeaveBalanceSummary[]> {
    const yearlyTypes = await tx.leaveType.findMany({
      where: {
        tenantId,
        kind: 'YEARLY',
        active: true,
      },
      orderBy: { code: 'asc' },
    });

    const ledgerEntries = await tx.leaveLedgerEntry.findMany({
      where: {
        tenantId,
        employeeId,
        year,
      },
    });

    const pendingRequests = await tx.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: { in: ['PENDING_MANAGER', 'PENDING_HR'] },
      },
    });

    return yearlyTypes.map((type) => {
      const typeEntries = ledgerEntries.filter((e) => e.leaveTypeId === type.id);
      const balance = typeEntries.reduce((acc, curr) => acc + curr.days, 0);

      const typePending = pendingRequests
        .filter((r) => r.leaveTypeId === type.id && r.startDate.getUTCFullYear() === year)
        .reduce((acc, curr) => acc + curr.days, 0);

      return {
        leaveTypeId: type.id,
        code: type.code,
        name: type.name,
        balance,
        pending: typePending,
        available: Math.max(0, balance - typePending),
      };
    });
  }

  async grantYearlyBalances(user: AuthUser, year: number): Promise<{ created: number }> {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const activeEmployees = await tx.employee.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
      });

      const yearlyTypes = await tx.leaveType.findMany({
        where: { tenantId: user.tenantId, kind: 'YEARLY', active: true },
      });

      const existingGrants = await tx.leaveLedgerEntry.findMany({
        where: {
          tenantId: user.tenantId,
          year,
          type: 'GRANT',
        },
        select: { employeeId: true, leaveTypeId: true },
      });

      const grantedSet = new Set(
        existingGrants.map((g) => `${g.employeeId}:${g.leaveTypeId}`),
      );

      const onDate = todayInManila(this.clock.now());
      const toCreate: Prisma.LeaveLedgerEntryCreateManyInput[] = [];

      for (const emp of activeEmployees) {
        const hireDateStr = emp.hireDate.toISOString().split('T')[0];
        for (const type of yearlyTypes) {
          const key = `${emp.id}:${type.id}`;
          if (grantedSet.has(key)) {
            continue;
          }

          const eligible = isEligibleForGrant(
            {
              kind: type.kind as 'YEARLY',
              defaultDays: type.defaultDays,
              countingMode: type.countingMode as any,
              eligibleGender: type.eligibleGender,
              eligibleMaritalStatus: type.eligibleMaritalStatus,
              minServiceMonths: type.minServiceMonths,
            },
            { hireDate: hireDateStr },
            onDate,
          );

          if (eligible) {
            toCreate.push({
              tenantId: user.tenantId,
              employeeId: emp.id,
              leaveTypeId: type.id,
              year,
              type: 'GRANT',
              days: type.defaultDays,
              reason: `Annual balance grant for ${year}`,
              createdById: user.userId,
            });
            grantedSet.add(key);
          }
        }
      }

      if (toCreate.length > 0) {
        await tx.leaveLedgerEntry.createMany({
          data: toCreate,
        });
      }

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'LeaveGrantRun',
        entityId: `grant-${year}`,
        after: { year, created: toCreate.length },
      });

      return { created: toCreate.length };
    });
  }

  async getEmployeeBalances(
    user: AuthUser,
    employeeId: string,
    year?: number,
  ): Promise<LeaveBalanceSummary[]> {
    if (!UUID_REGEX.test(employeeId)) {
      throw new NotFoundException('Employee not found');
    }

    const targetYear = year ?? new Date().getUTCFullYear();

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId: user.tenantId },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      const isSelf = user.employeeId === employeeId;
      const canAdjust = hasPermission(user, 'balance.adjust');
      const canReadAll = hasPermission(user, 'employee.read.all');
      const isManagerOf = employee.managerId === user.employeeId && hasPermission(user, 'team.read');

      if (!isSelf && !canAdjust && !canReadAll && !isManagerOf) {
        throw new ForbiddenException('You do not have permission to view this employee balances');
      }

      return this.summary(tx, user.tenantId, employeeId, targetYear);
    });
  }

  async adjustBalance(
    user: AuthUser,
    employeeId: string,
    dto: CreateBalanceAdjustmentDto,
  ) {
    if (!UUID_REGEX.test(employeeId)) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId: user.tenantId },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      const leaveType = await tx.leaveType.findFirst({
        where: { id: dto.leaveTypeId, tenantId: user.tenantId },
      });
      if (!leaveType) {
        throw new NotFoundException('Leave type not found');
      }

      const ledgerEntries = await tx.leaveLedgerEntry.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
        },
      });

      const currentBalance = ledgerEntries.reduce((sum, e) => sum + e.days, 0);
      const newBalance = currentBalance + dto.days;

      if (newBalance < 0) {
        throw new BadRequestException('Adjustment would make the balance negative');
      }

      const created = await tx.leaveLedgerEntry.create({
        data: {
          tenantId: user.tenantId,
          employeeId,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
          type: 'ADJUST',
          days: dto.days,
          reason: dto.reason.trim(),
          createdById: user.userId,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'LeaveLedgerEntry',
        entityId: created.id,
        after: created,
      });

      return {
        id: created.id,
        days: created.days,
        balance: newBalance,
      };
    });
  }
}
