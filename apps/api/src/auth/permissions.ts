import { Role } from '@prisma/client';

export type Permission =
  | 'employee.read.all'
  | 'employee.write'
  | 'team.read'
  | 'role.assign'
  | 'department.write'
  | 'leaveType.write'
  | 'holiday.write'
  | 'balance.adjust'
  | 'leave.file'
  | 'leave.approve.manager'
  | 'leave.approve.hr'
  | 'audit.read';

export interface AuthUser {
  userId: string;
  tenantId: string;
  employeeId: string;
  roles: Role[];
  email?: string;
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    'department.write',
    'leaveType.write',
    'holiday.write',
    'role.assign',
    'employee.read.all',
    'audit.read',
  ],
  HR: [
    'employee.read.all',
    'employee.write',
    'balance.adjust',
    'leave.approve.hr',
    'audit.read',
  ],
  MANAGER: ['team.read', 'leave.approve.manager'],
  EMPLOYEE: ['leave.file'],
};

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  for (const role of user.roles) {
    const permissions = ROLE_PERMISSIONS[role];
    if (permissions && permissions.includes(permission)) {
      return true;
    }
  }
  return false;
}
