import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hasPermission, type AuthUser } from '../auth/permissions.js';
import { EmailService } from './email.service.js';
import {
  buildCorporateEmailHtml,
  resolveEmailContent,
} from './email-templates.js';
import type { SendEmailDto } from './dto/send-email.dto.js';

export interface NotifyInput {
  tenantId: string;
  recipientUserIds: string[];
  message: string;
  link?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
  ) {}

  async notify(tx: Prisma.TransactionClient, input: NotifyInput): Promise<void> {
    if (!input.recipientUserIds || input.recipientUserIds.length === 0) {
      return;
    }

    const uniqueRecipientIds = [...new Set(input.recipientUserIds.filter(Boolean))];
    if (uniqueRecipientIds.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: uniqueRecipientIds.map((recipientId) => ({
        tenantId: input.tenantId,
        recipientId,
        message: input.message,
        link: input.link ?? null,
      })),
    });

    // Dispatch automated workflow emails asynchronously when SMTP or Resend is configured
    if (!this.emailService.isConfigured()) {
      return;
    }

    const recipients = await tx.user.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: uniqueRecipientIds },
      },
      select: {
        email: true,
        tenant: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const webBase = (process.env.APP_WEB_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const portalUrl = input.link
      ? `${webBase}${input.link.startsWith('/') ? '' : '/'}${input.link}`
      : `${webBase}/dashboard`;

    for (const r of recipients) {
      const { routedOverrideNote } = this.emailService.resolveTargetEmail(r.email);
      const company = r.tenant?.name || 'HRIS Portal';
      const subject = `HRIS Notification: ${input.message.slice(0, 80)}`;
      const fullName = r.employee
        ? `${r.employee.firstName} ${r.employee.lastName}`.trim()
        : r.email;
      const body = `Hi ${r.employee?.firstName || fullName},\n\n${input.message}`;
      const html = buildCorporateEmailHtml({
        company,
        subject,
        body,
        senderName: 'HRIS Automated Workflow',
        senderRoleLabel: 'System Notification',
        portalUrl,
        routedDemoRecipientNote: routedOverrideNote,
      });

      void this.emailService
        .sendEmail({
          to: r.email,
          recipientLabel: fullName,
          subject,
          html,
          text: `${body}\n\nOpen HRIS Portal: ${portalUrl}`,
        })
        .catch(() => {});
    }
  }

  async getUserNotifications(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const [items, unread] = await Promise.all([
        tx.notification.findMany({
          where: {
            tenantId: user.tenantId,
            recipientId: user.userId,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        tx.notification.count({
          where: {
            tenantId: user.tenantId,
            recipientId: user.userId,
            readAt: null,
          },
        }),
      ]);

      return { items, unread };
    });
  }

  async markAsRead(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.notification.findFirst({
        where: {
          id,
          tenantId: user.tenantId,
          recipientId: user.userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Notification not found');
      }

      if (existing.readAt) {
        return existing;
      }

      return tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    });
  }

  async markAllAsRead(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const res = await tx.notification.updateMany({
        where: {
          tenantId: user.tenantId,
          recipientId: user.userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      return { updated: res.count };
    });
  }

  async sendManualEmail(user: AuthUser, dto: SendEmailDto) {
    const canSendAll = hasPermission(user, 'email.send');
    const canSendTeam = hasPermission(user, 'email.send_team');

    if (!canSendAll && !canSendTeam) {
      throw new ForbiddenException('Insufficient permissions to send email');
    }

    if (!UUID_REGEX.test(dto.recipientEmployeeId)) {
      throw new NotFoundException('Recipient employee not found');
    }

    const webBase = (process.env.APP_WEB_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );

    const contextData = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const [senderEmp, targetEmp] = await Promise.all([
        tx.employee.findFirst({
          where: { id: user.employeeId, tenantId: user.tenantId },
          select: { firstName: true, lastName: true },
        }),
        tx.employee.findFirst({
          where: { id: dto.recipientEmployeeId, tenantId: user.tenantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            managerId: true,
            tenant: { select: { name: true } },
            user: { select: { id: true, email: true } },
          },
        }),
      ]);

      if (!targetEmp || !targetEmp.user?.email) {
        throw new NotFoundException('Recipient employee email account not found');
      }

      if (!canSendAll && targetEmp.managerId !== user.employeeId) {
        throw new ForbiddenException(
          'Managers can only send emails to their direct team members',
        );
      }

      return { senderEmp, targetEmp };
    });

    const { senderEmp, targetEmp } = contextData;
    const senderName = senderEmp
      ? `${senderEmp.firstName} ${senderEmp.lastName}`.trim()
      : user.email || 'HRIS User';

    const senderRoleLabel = user.roles.includes('ADMIN')
      ? 'Admin'
      : user.roles.includes('HR')
        ? 'HR'
        : user.roles.includes('MANAGER')
          ? 'Manager'
          : 'Staff';

    const recipientFullName = `${targetEmp.firstName} ${targetEmp.lastName}`.trim();
    const { routedOverrideNote } = this.emailService.resolveTargetEmail(
      targetEmp.user!.email,
    );

    const composed = resolveEmailContent({
      preset: dto.preset,
      subject: dto.subject,
      message: dto.message,
      meetingUrl: dto.meetingUrl,
      meetingAt: dto.meetingAt,
      recipientFirstName: targetEmp.firstName,
      recipientFullName,
      senderName,
      senderRoleLabel,
      tenantName: targetEmp.tenant?.name,
      portalUrl: `${webBase}/dashboard`,
      routedDemoRecipientNote: routedOverrideNote,
    });

    const outcome = await this.emailService.sendEmail({
      to: targetEmp.user!.email,
      recipientLabel: recipientFullName,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
    });

    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const notifMsg = composed.meetingUrl
        ? `[${senderRoleLabel} Meeting Invite] ${composed.subject}`
        : `[${senderRoleLabel} Message] ${composed.subject}`;

      await tx.notification.create({
        data: {
          tenantId: user.tenantId,
          recipientId: targetEmp.user!.id,
          message: notifMsg,
          link: '/dashboard',
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'send_email',
        entity: 'Employee',
        entityId: targetEmp.id,
        after: {
          preset: composed.preset,
          subject: composed.subject,
          hasMeetingUrl: Boolean(composed.meetingUrl),
          meetingPlatform: composed.meetingPlatform,
          deliveryMode: outcome.mode,
          delivered: outcome.delivered,
          routedTo: outcome.routedTo,
        },
      });
    });

    return {
      ...outcome,
      preset: composed.preset,
      subject: composed.subject,
      body: composed.body,
      meetingUrl: composed.meetingUrl,
      meetingAt: composed.meetingAt,
      meetingPlatform: composed.meetingPlatform,
    };
  }
}
