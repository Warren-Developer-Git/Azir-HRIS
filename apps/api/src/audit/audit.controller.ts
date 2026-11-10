import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';

@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission('audit.read')
  @Get()
  async listAuditLogs(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    return this.prisma.withTenant(user.tenantId, (tx) =>
      this.auditService.list(tx, user.tenantId, limit),
    );
  }
}
