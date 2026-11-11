import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BalancesService } from '../leave/balances.service.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto.js';
import { DecideDocumentRequestDto } from './dto/decide-document-request.dto.js';
import { calculateDoleDueAt } from './document-rules.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly balancesService: BalancesService,
  ) {}

  async listDocumentTypes(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.documentType.findMany({
        where: { tenantId: user.tenantId, active: true },
        orderBy: { name: 'asc' },
      });
    });
  }

  async fileRequest(user: AuthUser, dto: CreateDocumentRequestDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: user.employeeId },
        include: { department: true },
      });

      if (!employee || employee.status !== 'ACTIVE') {
        throw new BadRequestException('Active employee record required');
      }

      const docType = await tx.documentType.findFirst({
        where: { id: dto.documentTypeId, tenantId: user.tenantId, active: true },
      });

      if (!docType) {
        throw new NotFoundException('Document type not found');
      }

      // Query tenant holidays for DOLE 3-day working SLA calculation
      const holidaysList = await tx.holiday.findMany({
        where: { tenantId: user.tenantId },
      });
      const holidaySet = new Set(
        holidaysList.map((h) => h.date.toISOString().slice(0, 10)),
      );

      const requestedAt = new Date();
      const dueAt = calculateDoleDueAt(requestedAt, docType.slaDays, holidaySet);

      const created = await tx.documentRequest.create({
        data: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          documentTypeId: docType.id,
          purpose: dto.purpose.trim(),
          payPeriod: dto.payPeriod?.trim() || null,
          status: 'PENDING_APPROVAL',
          requestedAt,
          dueAt,
        },
        include: {
          documentType: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
              employeeNo: true,
            },
          },
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'DocumentRequest',
        entityId: created.id,
        after: created,
      });

      // Notify HR users
      const hrUsers = await tx.user.findMany({
        where: {
          tenantId: user.tenantId,
          roles: { has: 'HR' },
          active: true,
          id: { not: user.userId },
        },
        select: { id: true },
      });
      const hrUserIds = hrUsers.map((u) => u.id);
      if (hrUserIds.length > 0) {
        await this.notificationsService.notify(tx, {
          tenantId: user.tenantId,
          recipientUserIds: hrUserIds,
          message: `${employee.firstName} ${employee.lastName} requested ${docType.name} (Due in 3 working days).`,
          link: `/documents?tab=awaiting&id=${created.id}`,
        });
      }

      return created;
    });
  }

  async listRequests(
    user: AuthUser,
    scope: 'mine' | 'awaiting' | 'all' = 'mine',
  ) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const where: any = { tenantId: user.tenantId };

      if (scope === 'mine') {
        where.employeeId = user.employeeId;
      } else if (scope === 'awaiting') {
        if (!hasPermission(user, 'document.approve')) {
          throw new ForbiddenException('HR approval permission required');
        }
        where.status = 'PENDING_APPROVAL';
        where.employeeId = { not: user.employeeId }; // Anti-self approval in queue
      } else if (scope === 'all') {
        if (!hasPermission(user, 'document.approve')) {
          throw new ForbiddenException('HR approval permission required');
        }
      }

      return tx.documentRequest.findMany({
        where,
        include: {
          documentType: true,
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
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          issuedDocument: true,
        },
        orderBy: { requestedAt: 'desc' },
      });
    });
  }

  async getRequestById(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.documentRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          documentType: true,
          employee: {
            include: {
              department: true,
              manager: true,
            },
          },
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
            },
          },
          issuedDocument: {
            include: {
              issuedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  position: true,
                },
              },
            },
          },
        },
      });

      if (!req) {
        throw new NotFoundException('Document request not found');
      }

      const isRequester = req.employeeId === user.employeeId;
      const isApprover = hasPermission(user, 'document.approve');

      if (!isRequester && !isApprover) {
        throw new NotFoundException('Document request not found');
      }

      return req;
    });
  }

  async getPreview(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await this.getRequestById(user, id);

      // If already issued, return the frozen official snapshot
      if (req.status === 'APPROVED' && req.issuedDocument) {
        return {
          isDraft: false,
          watermark: null,
          documentNo: req.issuedDocument.documentNo,
          verificationCode: req.issuedDocument.verificationCode,
          issuedAt: req.issuedDocument.issuedAt,
          employee: req.employee,
          documentType: req.documentType,
          purpose: req.purpose,
          snapshotData: req.issuedDocument.snapshotData,
        };
      }

      // Generate live draft preview data
      let balances = null;
      if (req.documentType.code === 'LEAVE_CERT') {
        const year = new Date().getUTCFullYear();
        balances = await this.balancesService.summary(
          tx,
          user.tenantId,
          req.employeeId,
          year,
        );
      }

      return {
        isDraft: true,
        watermark: 'DRAFT — FOR PREVIEW ONLY — NOT VALID FOR OFFICIAL USE',
        documentNo: 'DRAFT-PREVIEW',
        requestedAt: req.requestedAt,
        dueAt: req.dueAt,
        purpose: req.purpose,
        payPeriod: req.payPeriod,
        documentType: req.documentType,
        employee: {
          id: req.employee.id,
          firstName: req.employee.firstName,
          lastName: req.employee.lastName,
          employeeNo: req.employee.employeeNo,
          position: req.employee.position,
          department: req.employee.department?.name,
          hireDate: req.employee.hireDate,
        },
        balances,
      };
    });
  }

  async decideRequest(
    user: AuthUser,
    id: string,
    dto: DecideDocumentRequestDto,
  ) {
    if (!hasPermission(user, 'document.approve')) {
      throw new ForbiddenException('HR approval permission required');
    }

    if (dto.decision === 'REJECTED' && (!dto.comment || !dto.comment.trim())) {
      throw new BadRequestException('A reason is required to reject this document request');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.documentRequest.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          documentType: true,
          employee: {
            include: { department: true },
          },
        },
      });

      if (!req) {
        throw new NotFoundException('Document request not found');
      }

      // Anti-self approval guard
      if (req.employeeId === user.employeeId) {
        throw new ForbiddenException('You cannot approve your own document request');
      }

      if (req.status !== 'PENDING_APPROVAL') {
        throw new ConflictException('This document request was already decided');
      }

      const now = new Date();

      if (dto.decision === 'REJECTED') {
        const updated = await tx.documentRequest.update({
          where: { id: req.id },
          data: {
            status: 'REJECTED',
            reviewedById: user.employeeId,
            reviewedAt: now,
            rejectReason: dto.comment?.trim(),
          },
          include: {
            documentType: true,
            employee: true,
          },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'decide',
          entity: 'DocumentRequest',
          entityId: req.id,
          before: { status: req.status },
          after: { status: 'REJECTED', reason: dto.comment },
        });

        if (req.employee.userId) {
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [req.employee.userId],
            message: `Your ${req.documentType.name} request was rejected: ${dto.comment}`,
            link: `/documents?id=${req.id}`,
          });
        }

        return updated;
      }

      // Case: APPROVED -> Generate Document & Issue
      const year = now.getUTCFullYear();
      const count = await tx.issuedDocument.count({
        where: {
          tenantId: user.tenantId,
          issuedAt: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
      });

      const documentNo = `AZIR-DOC-${year}-${String(count + 1).padStart(4, '0')}`;
      const verificationCode = crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();

      // Gather frozen snapshot data for tamper-proof immutability
      let balances = null;
      if (req.documentType.code === 'LEAVE_CERT') {
        balances = await this.balancesService.summary(
          tx,
          user.tenantId,
          req.employeeId,
          year,
        );
      }

      const snapshotData = {
        organization: 'Azir Company Global Tech',
        documentNo,
        verificationCode,
        documentTypeCode: req.documentType.code,
        documentTypeName: req.documentType.name,
        purpose: req.purpose,
        payPeriod: req.payPeriod || null,
        employee: {
          firstName: req.employee.firstName,
          lastName: req.employee.lastName,
          employeeNo: req.employee.employeeNo,
          position: req.employee.position,
          department: req.employee.department?.name || 'General',
          hireDate: req.employee.hireDate.toISOString().slice(0, 10),
        },
        balances,
        issuedBy: {
          id: user.employeeId,
          decidedAt: now.toISOString(),
        },
      };

      const issuedDoc = await tx.issuedDocument.create({
        data: {
          tenantId: user.tenantId,
          requestId: req.id,
          documentNo,
          verificationCode,
          snapshotData: snapshotData as any,
          issuedAt: now,
          issuedById: user.employeeId,
          status: 'VALID',
        },
      });

      const updated = await tx.documentRequest.update({
        where: { id: req.id },
        data: {
          status: 'APPROVED',
          reviewedById: user.employeeId,
          reviewedAt: now,
        },
        include: {
          documentType: true,
          employee: true,
          issuedDocument: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'decide',
        entity: 'DocumentRequest',
        entityId: req.id,
        before: { status: req.status },
        after: {
          status: 'APPROVED',
          documentNo,
          verificationCode,
        },
      });

      if (req.employee.userId) {
        await this.notificationsService.notify(tx, {
          tenantId: user.tenantId,
          recipientUserIds: [req.employee.userId],
          message: `Your ${req.documentType.name} has been certified and issued (${documentNo}). It is ready to download.`,
          link: `/documents?id=${req.id}`,
        });
      }

      return updated;
    });
  }

  async cancelRequest(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const req = await tx.documentRequest.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!req || req.employeeId !== user.employeeId) {
        throw new NotFoundException('Document request not found');
      }

      if (req.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException('Only pending requests can be cancelled');
      }

      const updated = await tx.documentRequest.update({
        where: { id: req.id },
        data: { status: 'CANCELLED' },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'cancel',
        entity: 'DocumentRequest',
        entityId: req.id,
        before: req,
        after: updated,
      });

      return updated;
    });
  }

  async verifyPublicDocument(code: string) {
    const verified = await this.prisma.verifyDocument(code.trim().toUpperCase());
    if (!verified) {
      throw new NotFoundException('Document verification failed or record does not exist');
    }

    return {
      isValid: verified.status === 'VALID',
      documentNo: verified.documentNo,
      documentType: verified.documentType,
      organization: verified.organization,
      maskedEmployeeName: verified.maskedEmployeeName,
      issuedAt: verified.issuedAt,
      status: verified.status,
    };
  }
}
