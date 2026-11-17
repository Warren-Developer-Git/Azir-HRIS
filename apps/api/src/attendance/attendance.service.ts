import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthUser } from '../auth/permissions.js';
import { PunchDto } from './dto/punch.dto.js';
import { CreateCorrectionDto } from './dto/create-correction.dto.js';
import { DecideCorrectionDto } from './dto/decide-correction.dto.js';
import {
  computeLateMinutes,
  computeUndertimeMinutes,
  determineAttendanceStatus,
} from './attendance-rules.js';

function getManilaDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async punch(user: AuthUser, dto: PunchDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const now = new Date();
      const todayDateStr = getManilaDateString(now);
      const todayDate = new Date(`${todayDateStr}T00:00:00.000Z`);

      const existing = await tx.attendanceRecord.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId: user.tenantId,
            employeeId: user.employeeId,
            date: todayDate,
          },
        },
      });

      if (!existing || !existing.timeIn) {
        // Clock In
        const late = computeLateMinutes(now);
        const status = late > 0 ? 'LATE' : 'PRESENT';

        const record = await tx.attendanceRecord.upsert({
          where: {
            tenantId_employeeId_date: {
              tenantId: user.tenantId,
              employeeId: user.employeeId,
              date: todayDate,
            },
          },
          update: {
            timeIn: now,
            locationType: dto.locationType || 'OFFICE',
            status,
            lateMinutes: late,
            notes: dto.notes ?? existing?.notes,
          },
          create: {
            tenantId: user.tenantId,
            employeeId: user.employeeId,
            date: todayDate,
            timeIn: now,
            locationType: dto.locationType || 'OFFICE',
            source: 'WEB_PUNCH',
            status,
            lateMinutes: late,
            notes: dto.notes,
          },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'clock_in',
          entity: 'AttendanceRecord',
          entityId: record.id,
          after: { timeIn: now.toISOString(), status },
        });

        return { action: 'CLOCKED_IN', record };
      } else {
        // Clock Out
        const undertime = computeUndertimeMinutes(now);
        const late = existing.lateMinutes;
        let status = existing.status;

        if (status !== 'OFFICIAL_BUSINESS' && status !== 'ON_LEAVE') {
          if (late > 0) {
            status = 'LATE';
          } else if (undertime > 0) {
            status = 'UNDERTIME';
          } else {
            status = 'PRESENT';
          }
        }

        const record = await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            timeOut: now,
            undertimeMinutes: undertime,
            status,
            notes: dto.notes ? `${existing.notes || ''} ${dto.notes}`.trim() : existing.notes,
          },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'clock_out',
          entity: 'AttendanceRecord',
          entityId: record.id,
          after: { timeOut: now.toISOString(), status, undertimeMinutes: undertime },
        });

        return { action: 'CLOCKED_OUT', record };
      }
    });
  }

  async getToday(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const todayDateStr = getManilaDateString(new Date());
      const todayDate = new Date(`${todayDateStr}T00:00:00.000Z`);

      return tx.attendanceRecord.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId: user.tenantId,
            employeeId: user.employeeId,
            date: todayDate,
          },
        },
      });
    });
  }

  async getMyDtr(user: AuthUser, month?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      let targetMonth = month;
      if (!targetMonth) {
        targetMonth = getManilaDateString(new Date()).slice(0, 7); // YYYY-MM
      }

      const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
      const nextMonth = new Date(startDate);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

      return tx.attendanceRecord.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          date: {
            gte: startDate,
            lt: nextMonth,
          },
        },
        orderBy: { date: 'asc' },
      });
    });
  }

  async getTeamDtr(user: AuthUser, dateStr?: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const targetStr = dateStr || getManilaDateString(new Date());
      const targetDate = new Date(`${targetStr}T00:00:00.000Z`);

      const isHrOrAdmin = user.roles.includes('HR') || user.roles.includes('ADMIN');

      const employees = await tx.employee.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
          ...(isHrOrAdmin ? {} : { managerId: user.employeeId }),
        },
        include: {
          department: { select: { id: true, name: true } },
          attendanceRecords: {
            where: { date: targetDate },
          },
        },
        orderBy: { lastName: 'asc' },
      });

      return employees.map((emp) => ({
        employeeId: emp.id,
        employeeNo: emp.employeeNo,
        firstName: emp.firstName,
        lastName: emp.lastName,
        position: emp.position,
        department: emp.department?.name || 'General',
        attendance: emp.attendanceRecords[0] || null,
      }));
    });
  }

  async fileCorrection(user: AuthUser, dto: CreateCorrectionDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const targetDate = new Date(`${dto.date}T00:00:00.000Z`);

      const created = await tx.attendanceCorrectionRequest.create({
        data: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          date: targetDate,
          type: dto.type,
          proposedTimeIn: dto.proposedTimeIn ? new Date(dto.proposedTimeIn) : null,
          proposedTimeOut: dto.proposedTimeOut ? new Date(dto.proposedTimeOut) : null,
          locationType: dto.locationType || 'FIELD_CLIENT_SITE',
          destination: dto.destination || null,
          reason: dto.reason,
          status: 'PENDING',
        },
        include: {
          employee: {
            include: {
              manager: { select: { id: true, userId: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      // Notify direct manager
      if (created.employee.manager?.userId) {
        const typeName = dto.type === 'OFFICIAL_BUSINESS' ? 'Official Business (OB) Slip' : 'Attendance Correction';
        await this.notificationsService.notify(tx, {
          tenantId: user.tenantId,
          recipientUserIds: [created.employee.manager.userId],
          message: `${created.employee.firstName} ${created.employee.lastName} submitted an ${typeName} for ${dto.date}.`,
          link: `/attendance?tab=requests&id=${created.id}`,
        });
      }

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'file_correction',
        entity: 'AttendanceCorrectionRequest',
        entityId: created.id,
        after: { type: dto.type, date: dto.date, reason: dto.reason },
      });

      return created;
    });
  }

  async listCorrections(user: AuthUser, scope?: 'mine' | 'awaiting' | 'all') {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const isHrOrAdmin = user.roles.includes('HR') || user.roles.includes('ADMIN');

      if (scope === 'awaiting') {
        return tx.attendanceCorrectionRequest.findMany({
          where: {
            tenantId: user.tenantId,
            status: 'PENDING',
            ...(isHrOrAdmin
              ? {}
              : {
                  employee: { managerId: user.employeeId },
                }),
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeNo: true,
                position: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (scope === 'all' && isHrOrAdmin) {
        return tx.attendanceCorrectionRequest.findMany({
          where: { tenantId: user.tenantId },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeNo: true,
                position: true,
                department: { select: { name: true } },
              },
            },
            decidedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      // Default: mine
      return tx.attendanceCorrectionRequest.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
        },
        include: {
          decidedBy: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async decideCorrection(user: AuthUser, id: string, dto: DecideCorrectionDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.attendanceCorrectionRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          employee: {
            include: {
              user: { select: { id: true } },
            },
          },
        },
      });

      if (!req) {
        throw new NotFoundException('Attendance correction request not found');
      }

      if (req.status !== 'PENDING') {
        throw new BadRequestException(`Request has already been decided (${req.status})`);
      }

      const isDirectManager = req.employee.managerId === user.employeeId;
      const isHrOrAdmin = user.roles.includes('HR') || user.roles.includes('ADMIN');

      if (!isDirectManager && !isHrOrAdmin) {
        throw new ForbiddenException('Only the direct manager or HR can decide this attendance request');
      }

      const nextStatus = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const now = new Date();

      const updated = await tx.attendanceCorrectionRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          decidedById: user.employeeId,
          decidedAt: now,
          decisionNote: dto.comment || null,
        },
      });

      // If approved, update/rectify the AttendanceRecord
      if (nextStatus === 'APPROVED') {
        if (req.type === 'OFFICIAL_BUSINESS') {
          await tx.attendanceRecord.upsert({
            where: {
              tenantId_employeeId_date: {
                tenantId: user.tenantId,
                employeeId: req.employeeId,
                date: req.date,
              },
            },
            update: {
              locationType: req.locationType,
              source: 'CORRECTION_OB',
              status: 'OFFICIAL_BUSINESS',
              lateMinutes: 0,
              undertimeMinutes: 0,
              notes: req.destination
                ? `OB: ${req.destination} - ${req.reason}${dto.comment ? ` (Note: ${dto.comment})` : ''}`
                : `OB: ${req.reason}${dto.comment ? ` (Note: ${dto.comment})` : ''}`,
            },
            create: {
              tenantId: user.tenantId,
              employeeId: req.employeeId,
              date: req.date,
              locationType: req.locationType,
              source: 'CORRECTION_OB',
              status: 'OFFICIAL_BUSINESS',
              lateMinutes: 0,
              undertimeMinutes: 0,
              notes: req.destination
                ? `OB: ${req.destination} - ${req.reason}${dto.comment ? ` (Note: ${dto.comment})` : ''}`
                : `OB: ${req.reason}${dto.comment ? ` (Note: ${dto.comment})` : ''}`,
            },
          });
        } else {
          // MISSED_PUNCH
          const late = req.proposedTimeIn ? computeLateMinutes(req.proposedTimeIn) : 0;
          const under = req.proposedTimeOut ? computeUndertimeMinutes(req.proposedTimeOut) : 0;
          const status = determineAttendanceStatus({
            timeIn: req.proposedTimeIn,
            timeOut: req.proposedTimeOut,
          });

          const noteText = `Corrected: ${req.reason}${dto.comment ? ` (Note: ${dto.comment})` : ''}`;

          await tx.attendanceRecord.upsert({
            where: {
              tenantId_employeeId_date: {
                tenantId: user.tenantId,
                employeeId: req.employeeId,
                date: req.date,
              },
            },
            update: {
              timeIn: req.proposedTimeIn,
              timeOut: req.proposedTimeOut,
              locationType: req.locationType,
              source: 'CORRECTION_OB',
              status,
              lateMinutes: late,
              undertimeMinutes: under,
              notes: noteText,
            },
            create: {
              tenantId: user.tenantId,
              employeeId: req.employeeId,
              date: req.date,
              timeIn: req.proposedTimeIn,
              timeOut: req.proposedTimeOut,
              locationType: req.locationType,
              source: 'CORRECTION_OB',
              status,
              lateMinutes: late,
              undertimeMinutes: under,
              notes: noteText,
            },
          });
        }
      }

      // Notify employee
      if (req.employee.user?.id) {
        const typeLabel = req.type === 'OFFICIAL_BUSINESS' ? 'Official Business (OB) Slip' : 'Attendance Correction';
        await this.notificationsService.notify(tx, {
          tenantId: user.tenantId,
          recipientUserIds: [req.employee.user.id],
          message: `Your ${typeLabel} for ${req.date.toISOString().slice(0, 10)} has been ${nextStatus.toLowerCase()}.`,
          link: `/attendance?tab=requests&id=${req.id}`,
        });
      }

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'decide_correction',
        entity: 'AttendanceCorrectionRequest',
        entityId: id,
        after: { status: nextStatus, note: dto.comment },
      });

      return updated;
    });
  }
}
