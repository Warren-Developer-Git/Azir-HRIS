import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BalancesService } from '../leave/balances.service.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balancesService: BalancesService,
  ) {}

  async getDashboard(user: AuthUser) {
    const currentYear = new Date().getUTCFullYear();

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // 1. Caller's balances
      const myBalances = await this.balancesService.summary(
        tx,
        user.tenantId,
        user.employeeId,
        currentYear,
      );

      // 2. Caller's 5 recent requests
      const myRecentRequests = await tx.leaveRequest.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
        },
        include: {
          leaveType: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const response: any = {
        myBalances,
        myRecentRequests,
      };

      // 3. Awaiting approvals (for Managers and HR)
      const canApproveMgr = hasPermission(user, 'leave.approve.manager');
      const canApproveHr = hasPermission(user, 'leave.approve.hr');

      if (canApproveMgr || canApproveHr) {
        const conditions: any[] = [];

        if (canApproveMgr) {
          conditions.push({
            status: 'PENDING_MANAGER',
            employee: {
              managerId: user.employeeId,
            },
          });
        }

        if (canApproveHr) {
          conditions.push({
            status: 'PENDING_HR',
            employeeId: {
              not: user.employeeId,
            },
          });
        }

        const whereAwaiting = {
          tenantId: user.tenantId,
          OR: conditions,
        };

        const [awaitingCount, awaitingItems] = await Promise.all([
          tx.leaveRequest.count({ where: whereAwaiting }),
          tx.leaveRequest.findMany({
            where: whereAwaiting,
            include: {
              leaveType: { select: { id: true, code: true, name: true } },
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeNo: true,
                  position: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
        ]);

        response.awaitingMe = {
          count: awaitingCount,
          items: awaitingItems,
        };
      }

      // 4. Team on leave this week
      const canReadTeam = hasPermission(user, 'team.read');
      const canReadAll = hasPermission(user, 'employee.read.all');

      if (canReadTeam || canReadAll || canApproveHr) {
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0 is Sunday
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startOfWeek = new Date(now);
        startOfWeek.setUTCDate(now.getUTCDate() + mondayOffset);
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
        endOfWeek.setUTCHours(23, 59, 59, 999);

        const teamWhere: any = {
          tenantId: user.tenantId,
          status: 'APPROVED',
          startDate: { lte: endOfWeek },
          endDate: { gte: startOfWeek },
        };

        if (!canReadAll && !canApproveHr && canReadTeam) {
          teamWhere.employee = {
            managerId: user.employeeId,
          };
        }

        const teamOnLeave = await tx.leaveRequest.findMany({
          where: teamWhere,
          include: {
            leaveType: { select: { code: true, name: true } },
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                position: true,
              },
            },
          },
          orderBy: { startDate: 'asc' },
          take: 10,
        });

        response.teamOnLeaveThisWeek = teamOnLeave;
      }

      // 5. Headcount (HR & Admin only)
      if (canReadAll) {
        const [totalActive, departments] = await Promise.all([
          tx.employee.count({
            where: { tenantId: user.tenantId, status: 'ACTIVE' },
          }),
          tx.department.findMany({
            where: { tenantId: user.tenantId, active: true },
            include: {
              _count: {
                select: {
                  employees: {
                    where: { status: 'ACTIVE' },
                  },
                },
              },
            },
            orderBy: { name: 'asc' },
          }),
        ]);

        response.headcount = {
          total: totalActive,
          byDepartment: departments.map((d) => ({
            departmentId: d.id,
            name: d.name,
            count: d._count.employees,
          })),
        };
      }

      return response;
    });
  }
}
