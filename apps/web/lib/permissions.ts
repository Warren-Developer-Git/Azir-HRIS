export type Role = 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

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
  | 'document.request'
  | 'document.approve'
  | 'document.approve.compensation'
  | 'payroll.manage'
  | 'payroll.approve'
  | 'payroll.view.all'
  | 'payroll.view.own'
  | 'attendance.punch'
  | 'attendance.view.own'
  | 'attendance.correct'
  | 'attendance.approve'
  | 'attendance.view.all'
  | 'attendance.manage'
  | 'email.send'
  | 'email.send_team'
  | 'audit.read';

export interface UserSession {
  id: string;
  email: string;
  roles: Role[];
  employeeId: string;
  name: string;
  tenantName: string;
  avatarUrl?: string | null;
  gender?: string | null;
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    'department.write',
    'leaveType.write',
    'holiday.write',
    'role.assign',
    'employee.read.all',
    'employee.write',
    'balance.adjust',
    'document.request',
    'document.approve',
    'document.approve.compensation',
    'payroll.manage',
    'payroll.approve',
    'payroll.view.all',
    'payroll.view.own',
    'attendance.punch',
    'attendance.view.own',
    'attendance.correct',
    'attendance.approve',
    'attendance.view.all',
    'attendance.manage',
    'email.send',
    'audit.read',
  ],
  HR: [
    'employee.read.all',
    'employee.write',
    'balance.adjust',
    'leave.approve.hr',
    'document.request',
    'document.approve',
    'document.approve.compensation',
    'payroll.manage',
    'payroll.approve',
    'payroll.view.all',
    'payroll.view.own',
    'attendance.punch',
    'attendance.view.own',
    'attendance.correct',
    'attendance.approve',
    'attendance.view.all',
    'attendance.manage',
    'email.send',
    'audit.read',
  ],
  MANAGER: [
    'team.read',
    'leave.approve.manager',
    'document.request',
    'payroll.view.own',
    'attendance.punch',
    'attendance.view.own',
    'attendance.correct',
    'attendance.approve',
    'email.send_team',
  ],
  EMPLOYEE: [
    'leave.file',
    'document.request',
    'payroll.view.own',
    'attendance.punch',
    'attendance.view.own',
    'attendance.correct',
  ],
};

export function hasPermission(
  roles: Role[] | undefined,
  permission: Permission,
): boolean {
  if (!roles) return false;
  for (const role of roles) {
    const permissions = ROLE_PERMISSIONS[role];
    if (permissions && permissions.includes(permission)) {
      return true;
    }
  }
  return false;
}
