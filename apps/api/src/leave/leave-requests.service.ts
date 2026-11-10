import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BalancesService } from './balances.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Clock } from './clock.js';
import {
  todayInManila,
  countLeaveDays,
  isEligibleToFile,
  LeaveTypeRule,
} from './leave-rules.js';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto.js';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto.js';
import { DecideLeaveRequestDto } from './dto/decide-leave-request.dto.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly balancesService: BalancesService,
    private readonly clock: Clock,
    private readonly notificationsService: NotificationsService,
  ) {}

  async fileRequest(user: AuthUser, dto: CreateLeaveRequestDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      // Row lock on the employee to prevent race conditions / double submit
      await tx.$executeRaw`SELECT 1 FROM "Employee" WHERE id = ${user.employeeId}::uuid FOR UPDATE`;

      const employee = await tx.employee.findUnique({
        where: { id: user.employeeId },
        include: { manager: true },
      });

      if (!employee || employee.status !== 'ACTIVE') {
        throw new BadRequestException('Active employee record required');
      }

      const leaveType = await tx.leaveType.findUnique({
        where: { id: dto.leaveTypeId },
      });

      if (!leaveType || !leaveType.active) {
        throw new BadRequestException('You are not eligible for this leave type');
      }

      // Rule 1: startDate <= endDate
      if (dto.startDate > dto.endDate) {
        throw new BadRequestException('End date must be on or after start date');
      }

      // Rule 2: startDate >= today in Manila
      const today = todayInManila(this.clock.now());
      if (dto.startDate < today) {
        throw new BadRequestException('Leave cannot start in the past');
      }

      // Rule 3: same calendar year
      const startYear = parseInt(dto.startDate.split('-')[0], 10);
      const endYear = parseInt(dto.endDate.split('-')[0], 10);
      if (startYear !== endYear) {
        throw new BadRequestException(
          'A request cannot cross into another year; file two requests',
        );
      }

      // Rule 4: eligible to file
      const rule: LeaveTypeRule = {
        kind: leaveType.kind,
        defaultDays: leaveType.defaultDays,
        countingMode: leaveType.countingMode,
        eligibleGender: leaveType.eligibleGender,
        eligibleMaritalStatus: leaveType.eligibleMaritalStatus,
        minServiceMonths: leaveType.minServiceMonths,
      };

      if (!isEligibleToFile(rule, { gender: employee.gender, maritalStatus: employee.maritalStatus })) {
        throw new BadRequestException('You are not eligible for this leave type');
      }

      // Rule 5: count days skipping weekends & tenant holidays
      const holidaysList = await tx.holiday.findMany({
        where: { tenantId: user.tenantId },
      });
      const holidaySet = new Set(
        holidaysList.map((h) => h.date.toISOString().slice(0, 10)),
      );

      const days = countLeaveDays(
        dto.startDate,
        dto.endDate,
        leaveType.countingMode,
        holidaySet,
      );

      if (days === 0) {
        throw new BadRequestException('Selected dates contain no leave days');
      }

      // Rule 6: PER_EVENT check
      if (leaveType.kind === 'PER_EVENT') {
        if (days > leaveType.defaultDays) {
          throw new BadRequestException(
            `Maximum is ${leaveType.defaultDays} days per request`,
          );
        }
      }

      // Rule 7: no overlap with own PENDING_* or APPROVED requests
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          status: { in: ['PENDING_MANAGER', 'PENDING_HR', 'APPROVED'] },
          startDate: { lte: new Date(dto.endDate) },
          endDate: { gte: new Date(dto.startDate) },
        },
      });

      if (overlap) {
        throw new ConflictException('Overlaps an existing request');
      }

      // Rule 8: YEARLY balance check
      if (leaveType.kind === 'YEARLY') {
        const balances = await this.balancesService.summary(
          tx,
          user.tenantId,
          user.employeeId,
          startYear,
        );
        const typeBal = balances.find((b) => b.leaveTypeId === leaveType.id);
        const available = typeBal ? typeBal.available : 0;
        if (days > available) {
          throw new BadRequestException(
            `Not enough balance (available: ${available})`,
          );
        }
      }

      // Status determined by manager status
      const hasActiveManager = employee.manager && employee.manager.status === 'ACTIVE';
      const initialStatus = hasActiveManager ? 'PENDING_MANAGER' : 'PENDING_HR';

      const created = await tx.leaveRequest.create({
        data: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          leaveTypeId: leaveType.id,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          days,
          reason: dto.reason,
          status: initialStatus,
        },
        include: {
          leaveType: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'LeaveRequest',
        entityId: created.id,
        after: created,
      });

      if (hasActiveManager && employee.manager?.userId) {
        await this.notificationsService.notify(tx, {
          tenantId: user.tenantId,
          recipientUserIds: [employee.manager.userId],
          message: `${employee.firstName} ${employee.lastName} requested ${days} day(s) of ${leaveType.name}.`,
          link: `/approvals?id=${created.id}`,
        });
      }

      return created;
    });
  }

  async listRequests(
    user: AuthUser,
    scope: 'mine' | 'awaiting' | 'all' = 'mine',
    status?: string,
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: any = { tenantId: user.tenantId };
      if (status) {
        where.status = status;
      }

      if (scope === 'mine') {
        where.employeeId = user.employeeId;
      } else if (scope === 'awaiting') {
        const isHr = hasPermission(user, 'leave.approve.hr');
        const conditions: any[] = [
          // Manager awaiting
          {
            status: 'PENDING_MANAGER',
            employee: { managerId: user.employeeId },
          },
        ];

        // HR awaiting (requests in PENDING_HR not filed by caller)
        if (isHr) {
          conditions.push({
            status: 'PENDING_HR',
            employeeId: { not: user.employeeId },
          });
        }

        where.OR = conditions;
      } else if (scope === 'all') {
        if (!hasPermission(user, 'leave.approve.hr')) {
          throw new BadRequestException('Requires HR approval permissions');
        }
      }

      return tx.leaveRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNo: true,
              position: true,
              department: { select: { id: true, name: true } },
            },
          },
          leaveType: true,
          approvals: {
            include: {
              approver: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async getRequestById(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          employee: {
            include: {
              manager: true,
              department: true,
            },
          },
          leaveType: true,
          approvals: {
            include: {
              approver: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: { decidedAt: 'asc' },
          },
        },
      });

      if (!req) {
        throw new NotFoundException('Leave request not found');
      }

      // Access control: own, report's, or HR
      const isOwner = req.employeeId === user.employeeId;
      const isManager = req.employee.managerId === user.employeeId;
      const isHr = hasPermission(user, 'leave.approve.hr');

      if (!isOwner && !isManager && !isHr) {
        throw new NotFoundException('Leave request not found');
      }

      return req;
    });
  }

  async editRequest(user: AuthUser, id: string, dto: UpdateLeaveRequestDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Employee" WHERE id = ${user.employeeId}::uuid FOR UPDATE`;

      const req = await tx.leaveRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { leaveType: true },
      });

      if (!req || req.employeeId !== user.employeeId) {
        throw new NotFoundException('Leave request not found');
      }

      if (req.status !== 'PENDING_MANAGER') {
        throw new ConflictException(
          'Only requests pending manager approval can be edited',
        );
      }

      const startDate = dto.startDate || req.startDate.toISOString().slice(0, 10);
      const endDate = dto.endDate || req.endDate.toISOString().slice(0, 10);
      const reason = dto.reason ?? req.reason;

      if (startDate > endDate) {
        throw new BadRequestException('End date must be on or after start date');
      }

      const today = todayInManila(this.clock.now());
      if (startDate < today) {
        throw new BadRequestException('Leave cannot start in the past');
      }

      const startYear = parseInt(startDate.split('-')[0], 10);
      const endYear = parseInt(endDate.split('-')[0], 10);
      if (startYear !== endYear) {
        throw new BadRequestException(
          'A request cannot cross into another year; file two requests',
        );
      }

      const holidaysList = await tx.holiday.findMany({
        where: { tenantId: user.tenantId },
      });
      const holidaySet = new Set(
        holidaysList.map((h) => h.date.toISOString().slice(0, 10)),
      );

      const days = countLeaveDays(
        startDate,
        endDate,
        req.leaveType.countingMode,
        holidaySet,
      );

      if (days === 0) {
        throw new BadRequestException('Selected dates contain no leave days');
      }

      // Check overlap excluding self
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          id: { not: req.id },
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          status: { in: ['PENDING_MANAGER', 'PENDING_HR', 'APPROVED'] },
          startDate: { lte: new Date(endDate) },
          endDate: { gte: new Date(startDate) },
        },
      });

      if (overlap) {
        throw new ConflictException('Overlaps an existing request');
      }

      // Balance check
      if (req.leaveType.kind === 'YEARLY') {
        const balances = await this.balancesService.summary(
          tx,
          user.tenantId,
          user.employeeId,
          startYear,
        );
        const typeBal = balances.find((b) => b.leaveTypeId === req.leaveTypeId);
        // Add back the current request days to available for editing self
        const available = (typeBal?.available ?? 0) + req.days;
        if (days > available) {
          throw new BadRequestException(
            `Not enough balance (available: ${available})`,
          );
        }
      }

      const updated = await tx.leaveRequest.update({
        where: { id: req.id },
        data: {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          days,
          reason,
        },
        include: { leaveType: true },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'update',
        entity: 'LeaveRequest',
        entityId: updated.id,
        before: req,
        after: updated,
      });

      return updated;
    });
  }

  async cancelRequest(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!req || req.employeeId !== user.employeeId) {
        throw new NotFoundException('Leave request not found');
      }

      if (req.status === 'APPROVED') {
        throw new ConflictException('Approved leave cannot be cancelled yet');
      }

      if (!['PENDING_MANAGER', 'PENDING_HR'].includes(req.status)) {
        throw new BadRequestException('Only pending requests can be cancelled');
      }

      const updated = await tx.leaveRequest.update({
        where: { id: req.id },
        data: { status: 'CANCELLED' },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'cancel',
        entity: 'LeaveRequest',
        entityId: updated.id,
        before: req,
        after: updated,
      });

      return updated;
    });
  }

  async decideRequest(
    user: AuthUser,
    id: string,
    dto: DecideLeaveRequestDto,
  ) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Leave request not found');
    }

    if (dto.decision === 'REJECTED' && (!dto.comment || !dto.comment.trim())) {
      throw new BadRequestException('A reason is required to reject');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          employee: {
            include: {
              user: true,
            },
          },
          leaveType: true,
        },
      });

      if (!req) {
        throw new NotFoundException('Leave request not found');
      }

      let step: 'MANAGER' | 'HR';
      let nextStatus: 'PENDING_HR' | 'APPROVED' | 'REJECTED';

      if (req.status === 'PENDING_MANAGER') {
        const canApproveAsManager =
          hasPermission(user, 'leave.approve.manager') &&
          req.employee.managerId === user.employeeId;

        if (!canApproveAsManager) {
          throw new NotFoundException('Leave request not found');
        }

        step = 'MANAGER';
        nextStatus = dto.decision === 'APPROVED' ? 'PENDING_HR' : 'REJECTED';
      } else if (req.status === 'PENDING_HR') {
        if (!hasPermission(user, 'leave.approve.hr')) {
          throw new NotFoundException('Leave request not found');
        }

        if (req.employeeId === user.employeeId) {
          throw new ForbiddenException('You cannot approve your own request');
        }

        step = 'HR';
        nextStatus = dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      } else {
        throw new ConflictException('This request was already decided');
      }

      // Optimistic concurrency control / row state match
      const updateResult = await tx.leaveRequest.updateMany({
        where: {
          id: req.id,
          status: req.status,
        },
        data: {
          status: nextStatus,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('This request was already decided');
      }

      // Record approval
      await tx.leaveApproval.create({
        data: {
          tenantId: user.tenantId,
          requestId: req.id,
          step,
          approverId: user.employeeId,
          decision: dto.decision,
          comment: dto.comment?.trim() || null,
        },
      });

      // If HR approved and YEARLY kind, deduct from ledger
      if (nextStatus === 'APPROVED' && req.leaveType.kind === 'YEARLY') {
        await tx.leaveLedgerEntry.create({
          data: {
            tenantId: user.tenantId,
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            year: req.startDate.getUTCFullYear(),
            type: 'DEDUCT',
            days: -req.days,
            requestId: req.id,
            reason: `Leave request approved: ${req.leaveType.name}`,
            createdById: user.userId,
          },
        });
      }

      // Notifications
      if (step === 'MANAGER') {
        if (dto.decision === 'APPROVED') {
          // Notify employee
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [req.employee.userId],
            message: 'Your leave request has been approved by your manager and forwarded to HR.',
            link: `/leave/${req.id}`,
          });

          // Notify HR users
          const hrUsers = await tx.user.findMany({
            where: {
              tenantId: user.tenantId,
              roles: { has: 'HR' },
              active: true,
            },
            select: { id: true },
          });
          const hrUserIds = hrUsers.map((u) => u.id);
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: hrUserIds,
            message: `New leave request from ${req.employee.firstName} ${req.employee.lastName} awaiting HR approval.`,
            link: `/approvals?id=${req.id}`,
          });
        } else {
          // Manager rejected
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [req.employee.userId],
            message: `Your leave request was rejected by your manager: ${dto.comment}`,
            link: `/leave/${req.id}`,
          });
        }
      } else if (step === 'HR') {
        if (dto.decision === 'APPROVED') {
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [req.employee.userId],
            message: 'Your leave request has been approved by HR.',
            link: `/leave/${req.id}`,
          });
        } else {
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [req.employee.userId],
            message: `Your leave request was rejected by HR: ${dto.comment}`,
            link: `/leave/${req.id}`,
          });
        }
      }

      // Audit log
      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'decide',
        entity: 'LeaveRequest',
        entityId: req.id,
        before: { status: req.status },
        after: {
          status: nextStatus,
          decision: dto.decision,
          comment: dto.comment?.trim() || null,
        },
      });

      return tx.leaveRequest.findUniqueOrThrow({
        where: { id: req.id },
        include: {
          leaveType: true,
          employee: true,
          approvals: {
            orderBy: { decidedAt: 'asc' },
            include: { approver: true },
          },
        },
      });
    });
  }
}
