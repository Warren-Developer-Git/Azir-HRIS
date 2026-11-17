import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmployeesService } from './employees.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import type { AuthUser } from '../auth/permissions.js';

const managerUser: AuthUser = {
  userId: 'user-mgr',
  tenantId: 'tenant-1',
  employeeId: 'emp-mgr',
  roles: ['MANAGER', 'EMPLOYEE'],
};

const hrUser: AuthUser = {
  userId: 'user-hr',
  tenantId: 'tenant-1',
  employeeId: 'emp-hr',
  roles: ['HR', 'EMPLOYEE'],
};

const sampleEmployeeRow = {
  id: 'emp-sub',
  tenantId: 'tenant-1',
  userId: 'user-sub',
  employeeNo: 'ACGT-007',
  firstName: 'Jose',
  lastName: 'Rizal',
  managerId: 'emp-mgr',
  basicSalary: '45000.00',
  allowances: '5000.00',
};

describe('Employees & Profile Security Hardening (Findings 3 & 4)', () => {
  it('omits basicSalary and allowances for MANAGER team reads but retains them for HR and self', async () => {
    const txMock = {
      employee: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([{ ...sampleEmployeeRow }]),
        findFirst: vi.fn().mockResolvedValue({ ...sampleEmployeeRow }),
      },
    };
    const prismaMock = {
      withTenant: vi.fn(async (_tid: string, fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    };
    const service = new EmployeesService(prismaMock as any, {} as any, {} as any);

    const teamList = await service.listEmployees(managerUser, { scope: 'team' });
    expect(teamList.data[0]).not.toHaveProperty('basicSalary');
    expect(teamList.data[0]).not.toHaveProperty('allowances');

    const teamDetail = await service.getEmployeeById(managerUser, '00000000-0000-0000-0000-000000000001');
    expect(teamDetail).not.toHaveProperty('basicSalary');
    expect(teamDetail).not.toHaveProperty('allowances');

    const hrDetail = await service.getEmployeeById(hrUser, '00000000-0000-0000-0000-000000000001');
    expect(hrDetail.basicSalary).toBe('45000.00');
    expect(hrDetail.allowances).toBe('5000.00');

    const selfUser: AuthUser = {
      userId: 'user-sub',
      tenantId: 'tenant-1',
      employeeId: 'emp-sub',
      roles: ['EMPLOYEE'],
    };
    const selfDetail = await service.getEmployeeById(selfUser, '00000000-0000-0000-0000-000000000001');
    expect(selfDetail.basicSalary).toBe('45000.00');
  });

  it('rejects unsafe avatarUrl schemes while accepting safe URLs and raster data URIs', async () => {
    const unsafePayloads = [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html,<script>alert(1)</script>',
      'http://insecure.example.com/a.png',
    ];
    for (const avatarUrl of unsafePayloads) {
      const dto = plainToInstance(UpdateProfileDto, { avatarUrl });
      const errors = await validate(dto);
      expect(errors.length, `Expected rejection for ${avatarUrl}`).toBeGreaterThan(0);
    }

    const safePayloads = [
      null,
      '',
      '/storage/public/tenant-1/avatars/123.png',
      'https://example.supabase.co/storage/v1/object/public/bucket/a.png',
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
    ];
    for (const avatarUrl of safePayloads) {
      const dto = plainToInstance(UpdateProfileDto, { avatarUrl });
      const errors = await validate(dto);
      expect(errors, `Expected acceptance for ${String(avatarUrl)}`).toHaveLength(0);
    }
  });
});
