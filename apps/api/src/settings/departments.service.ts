import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser } from '../auth/permissions.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createDepartment(user: AuthUser, dto: CreateDepartmentDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.department.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name.trim(),
          active: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'Department',
        entityId: created.id,
        after: created,
      });

      return created;
    });
  }

  async updateDepartment(user: AuthUser, id: string, dto: UpdateDepartmentDto) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.department.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Department not found');
      }

      const updated = await tx.department.update({
        where: { id },
        data: { name: dto.name.trim() },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'update',
        entity: 'Department',
        entityId: id,
        before: existing,
        after: updated,
      });

      return updated;
    });
  }

  async deleteDepartment(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.department.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Department not found');
      }

      const inUseCount = await tx.employee.count({
        where: { tenantId: user.tenantId, departmentId: id },
      });

      if (inUseCount === 0) {
        await tx.department.delete({ where: { id } });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'delete',
          entity: 'Department',
          entityId: id,
          before: existing,
        });

        return { deleted: true };
      } else {
        const deactivated = await tx.department.update({
          where: { id },
          data: { active: false },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'deactivate',
          entity: 'Department',
          entityId: id,
          before: existing,
          after: deactivated,
        });

        return { deactivated: true };
      }
    });
  }
}
