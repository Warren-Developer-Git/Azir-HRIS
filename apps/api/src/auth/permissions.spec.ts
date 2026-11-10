import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  ROLE_PERMISSIONS,
  AuthUser,
  Permission,
} from './permissions.js';

describe('Permissions & RBAC', () => {
  const hrUser: AuthUser = {
    userId: 'user-hr-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-hr-1',
    roles: ['HR'],
  };

  const employeeUser: AuthUser = {
    userId: 'user-emp-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-1',
    roles: ['EMPLOYEE'],
  };

  const adminEmployeeUser: AuthUser = {
    userId: 'user-admin-1',
    tenantId: 'tenant-1',
    employeeId: 'emp-admin-1',
    roles: ['ADMIN', 'EMPLOYEE'],
  };

  it('correctly validates single role permissions', () => {
    expect(hasPermission(hrUser, 'leave.approve.hr')).toBe(true);
    expect(hasPermission(hrUser, 'employee.read.all')).toBe(true);
    expect(hasPermission(hrUser, 'leave.file')).toBe(false);

    expect(hasPermission(employeeUser, 'leave.file')).toBe(true);
    expect(hasPermission(employeeUser, 'employee.read.all')).toBe(false);
    expect(hasPermission(employeeUser, 'leave.approve.manager')).toBe(false);
  });

  it('correctly computes the union of permissions for multi-role users', () => {
    // ADMIN has department.write, leaveType.write, etc.
    // EMPLOYEE has leave.file
    expect(hasPermission(adminEmployeeUser, 'department.write')).toBe(true);
    expect(hasPermission(adminEmployeeUser, 'leave.file')).toBe(true);
    expect(hasPermission(adminEmployeeUser, 'leave.approve.hr')).toBe(false);
  });
});
