import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { SetRolesDto } from './dto/set-roles.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { EmployeeStatus, Role, Prisma } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listEmployees(
    user: AuthUser,
    query: {
      search?: string;
      scope?: 'all' | 'team';
      status?: EmployeeStatus;
      departmentId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const scope = query.scope || 'all';

    if (scope === 'team') {
      if (!hasPermission(user, 'team.read')) {
        throw new ForbiddenException('Insufficient permissions');
      }
    } else {
      if (!hasPermission(user, 'employee.read.all')) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where: any = {
        tenantId: user.tenantId,
      };

      if (scope === 'team') {
        where.managerId = user.employeeId;
      }

      if (query.status) {
        where.status = query.status;
      }

      if (query.departmentId) {
        where.departmentId = query.departmentId;
      }

      if (query.search && query.search.trim()) {
        const search = query.search.trim();
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeNo: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [total, data] = await Promise.all([
        tx.employee.count({ where }),
        tx.employee.findMany({
          where,
          include: {
            user: { select: { email: true, roles: true, active: true } },
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { employeeNo: 'asc' },
          skip,
          take: pageSize,
        }),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async getEmployeeById(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          user: { select: { id: true, email: true, roles: true, active: true } },
          department: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true, employeeNo: true } },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      const isSelf = employee.id === user.employeeId;
      const isDirectReport =
        hasPermission(user, 'team.read') && employee.managerId === user.employeeId;
      const canReadAll = hasPermission(user, 'employee.read.all');

      if (!isSelf && !isDirectReport && !canReadAll) {
        throw new NotFoundException('Employee not found');
      }

      return employee;
    });
  }

  async createEmployee(user: AuthUser, dto: CreateEmployeeDto) {
    const roles: Role[] = dto.roles && dto.roles.length > 0 ? dto.roles : ['EMPLOYEE'];

    // Check role assignment permission if non-EMPLOYEE role is included
    const hasAdminRoles = roles.some((r) => r !== 'EMPLOYEE');
    if (hasAdminRoles && !hasPermission(user, 'role.assign')) {
      throw new ForbiddenException('role.assign permission required to assign administrative roles');
    }

    const email = dto.email.trim().toLowerCase();

    // Check duplicate email across any tenant (via security definer loginLookup)
    const globalExisting = await this.prisma.loginLookup(email);
    if (globalExisting) {
      throw new ConflictException('Email is already in use');
    }

    try {
      return await this.prisma.withTenant(user.tenantId, async (tx) => {
        // Check duplicate email within tenant
        const existingEmail = await tx.user.findFirst({
          where: { email },
        });
        if (existingEmail) {
          throw new ConflictException('Email is already in use');
        }

        // Check duplicate employeeNo
        const existingNo = await tx.employee.findFirst({
          where: { tenantId: user.tenantId, employeeNo: dto.employeeNo.trim() },
        });
        if (existingNo) {
          throw new ConflictException('Employee number is already in use');
        }

        // Validate department if provided
        const departmentId = dto.departmentId && dto.departmentId.trim() ? dto.departmentId.trim() : null;
        if (departmentId) {
          const dept = await tx.department.findFirst({
            where: { id: departmentId, tenantId: user.tenantId },
          });
          if (!dept) {
            throw new BadRequestException('Selected department does not exist');
          }
        }

        // Validate manager if provided
        const managerId = dto.managerId && dto.managerId.trim() ? dto.managerId.trim() : null;
        if (managerId) {
          const mgr = await tx.employee.findFirst({
            where: { id: managerId, tenantId: user.tenantId },
          });
          if (!mgr) {
            throw new BadRequestException('Selected manager does not exist');
          }
        }

        // Validate hireDate
        const cleanHireDate = dto.hireDate.includes('T') ? dto.hireDate.split('T')[0] : dto.hireDate.replace(/\//g, '-');
        const parsedHireDate = new Date(`${cleanHireDate}T00:00:00.000Z`);
        if (isNaN(parsedHireDate.getTime())) {
          throw new BadRequestException('hireDate must be a valid date string (YYYY-MM-DD)');
        }

        const temporaryPassword = crypto.randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);

        const newUser = await tx.user.create({
          data: {
            tenantId: user.tenantId,
            email,
            passwordHash,
            roles,
            active: true,
          },
        });

        const newEmployee = await tx.employee.create({
          data: {
            tenantId: user.tenantId,
            userId: newUser.id,
            employeeNo: dto.employeeNo.trim(),
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            departmentId,
            position: dto.position.trim(),
            managerId,
            hireDate: parsedHireDate,
            gender: dto.gender,
            maritalStatus: dto.maritalStatus,
            status: 'ACTIVE',
          },
          include: {
            user: { select: { email: true, roles: true, active: true } },
            department: true,
            manager: true,
          },
        });

        await this.auditService.record(tx, {
          tenantId: user.tenantId,
          actorId: user.userId,
          action: 'create',
          entity: 'Employee',
          entityId: newEmployee.id,
          after: {
            id: newEmployee.id,
            employeeNo: newEmployee.employeeNo,
            email: newUser.email,
            position: newEmployee.position,
            roles: newUser.roles,
          },
        });

        return {
          employee: newEmployee,
          temporaryPassword,
        };
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          const target = (err.meta?.target as string[]) || [];
          const targetStr = Array.isArray(target) ? target.join(',') : String(target);
          if (targetStr.includes('email') || targetStr.includes('User_email_key')) {
            throw new ConflictException('Email is already in use');
          }
          if (targetStr.includes('employeeNo')) {
            throw new ConflictException('Employee number is already in use');
          }
          throw new ConflictException('A user or employee with these details already exists');
        }
        if (err.code === 'P2003') {
          throw new BadRequestException('Selected department or manager does not exist');
        }
      }
      throw err;
    }
  }

  async updateEmployee(user: AuthUser, id: string, dto: UpdateEmployeeDto) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Employee not found');
      }

      // Manager cycle detection
      if (dto.managerId) {
        if (dto.managerId === id) {
          throw new BadRequestException('Manager cannot report to this employee');
        }

        // Walk manager chain upwards from proposed manager
        let currentManagerId: string | null = dto.managerId;
        const visited = new Set<string>();

        while (currentManagerId) {
          if (currentManagerId === id) {
            throw new BadRequestException('Manager cannot report to this employee');
          }
          if (visited.has(currentManagerId)) {
            break;
          }
          visited.add(currentManagerId);

          const mgr: { managerId: string | null } | null =
            await tx.employee.findUnique({
              where: { id: currentManagerId },
              select: { managerId: true },
            });
          currentManagerId = mgr?.managerId ?? null;
        }
      }

      const data: any = {};
      if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
      if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
      if (dto.position !== undefined) data.position = dto.position.trim();
      if (dto.managerId !== undefined) data.managerId = dto.managerId;
      if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
      if (dto.gender !== undefined) data.gender = dto.gender;
      if (dto.maritalStatus !== undefined) data.maritalStatus = dto.maritalStatus;
      if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
      if (dto.address !== undefined) data.address = dto.address?.trim() || null;

      const updated = await tx.employee.update({
        where: { id },
        data,
        include: {
          user: { select: { email: true, roles: true, active: true } },
          department: true,
          manager: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'update',
        entity: 'Employee',
        entityId: id,
        before: existing,
        after: updated,
      });

      return updated;
    });
  }

  async deactivateEmployee(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Employee not found');
    }

    if (id === user.employeeId) {
      throw new BadRequestException('You cannot deactivate yourself');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { user: true },
      });

      if (!existing) {
        throw new NotFoundException('Employee not found');
      }

      const updated = await tx.employee.update({
        where: { id },
        data: { status: 'INACTIVE' },
        include: {
          user: { select: { email: true, roles: true, active: true } },
          department: true,
          manager: true,
        },
      });

      await tx.user.update({
        where: { id: existing.userId },
        data: { active: false },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'deactivate',
        entity: 'Employee',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'INACTIVE', userActive: false },
      });

      return updated;
    });
  }

  async setRoles(user: AuthUser, id: string, dto: SetRolesDto) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Employee not found');
    }

    const roles: Role[] = [...new Set(dto.roles)];
    if (!roles.includes('EMPLOYEE')) {
      roles.push('EMPLOYEE');
    }

    if (id === user.employeeId && !roles.includes('ADMIN')) {
      throw new BadRequestException('You cannot remove your own admin role');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { user: true },
      });

      if (!existing) {
        throw new NotFoundException('Employee not found');
      }

      const updatedUser = await tx.user.update({
        where: { id: existing.userId },
        data: { roles },
        select: { id: true, email: true, roles: true, active: true },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'updateRoles',
        entity: 'User',
        entityId: existing.userId,
        before: { roles: existing.user.roles },
        after: { roles: updatedUser.roles },
      });

      return updatedUser;
    });
  }

  async resetPassword(user: AuthUser, id: string) {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { user: true },
      });

      if (!existing) {
        throw new NotFoundException('Employee not found');
      }

      const temporaryPassword = crypto.randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      await tx.user.update({
        where: { id: existing.userId },
        data: { passwordHash },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'resetPassword',
        entity: 'User',
        entityId: existing.userId,
      });

      return { temporaryPassword };
    });
  }

  async getProfile(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        include: {
          user: { select: { id: true, email: true, roles: true, active: true } },
          department: true,
          manager: { select: { id: true, firstName: true, lastName: true, employeeNo: true } },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee profile not found');
      }

      return employee;
    });
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
      });

      if (!existing) {
        throw new NotFoundException('Employee profile not found');
      }

      const data: any = {};
      if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
      if (dto.address !== undefined) data.address = dto.address?.trim() || null;
      if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl?.trim() || null;

      const updated = await tx.employee.update({
        where: { id: user.employeeId },
        data,
        include: {
          user: { select: { id: true, email: true, roles: true, active: true } },
          department: true,
          manager: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'updateProfile',
        entity: 'Employee',
        entityId: user.employeeId,
        before: { phone: existing.phone, address: existing.address, hasAvatar: !!existing.avatarUrl },
        after: { phone: updated.phone, address: updated.address, hasAvatar: !!updated.avatarUrl },
      });

      return updated;
    });
  }
}
