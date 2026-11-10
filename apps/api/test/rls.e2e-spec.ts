import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { createOwnerPrisma, createAppPrisma } from './helpers.js';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Row-Level Security & withTenant (e2e)', () => {
  let ownerDb: PrismaClient;
  let appDb: PrismaService;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    ownerDb = createOwnerPrisma();
    appDb = createAppPrisma();

    // Clean tables
    await ownerDb.$executeRawUnsafe(`TRUNCATE "Tenant" CASCADE;`);

    // Insert tenants A and B as owner
    const a = await ownerDb.tenant.create({ data: { name: 'Tenant A' } });
    const b = await ownerDb.tenant.create({ data: { name: 'Tenant B' } });
    tenantA = a.id;
    tenantB = b.id;

    // Insert departments for each tenant as owner
    await ownerDb.department.create({ data: { tenantId: tenantA, name: 'Dept A' } });
    await ownerDb.department.create({ data: { tenantId: tenantB, name: 'Dept B' } });

    // Insert user for tenant B to test loginLookup
    await ownerDb.user.create({
      data: {
        tenantId: tenantB,
        email: 'userb@bayanihan.test',
        passwordHash: 'hashed_pw_b',
        roles: ['EMPLOYEE'],
      },
    });
  });

  afterAll(async () => {
    await ownerDb.$disconnect();
    await appDb.$disconnect();
  });

  it('sees only its own tenant rows', async () => {
    const rows = await appDb.withTenant(tenantA, (tx) => tx.department.findMany());
    expect(rows.map((r) => r.tenantId)).toEqual([tenantA]);
    expect(rows.map((r) => r.name)).toEqual(['Dept A']);
  });

  it('sees nothing without a tenant set', async () => {
    const rows = await appDb.$queryRaw<unknown[]>`SELECT * FROM "Department"`;
    expect(rows).toEqual([]);
  });

  it('cannot insert into another tenant', async () => {
    await expect(
      appDb.withTenant(tenantA, (tx) =>
        tx.department.create({ data: { tenantId: tenantB, name: 'Illicit Dept' } }),
      ),
    ).rejects.toThrow();
  });

  it('cannot update or delete audit logs as app role', async () => {
    // Insert an audit log as owner
    const log = await ownerDb.auditLog.create({
      data: {
        tenantId: tenantA,
        actorId: (
          await ownerDb.user.create({
            data: {
              tenantId: tenantA,
              email: 'actor@acme.test',
              passwordHash: 'pw',
              roles: ['ADMIN'],
            },
          })
        ).id,
        action: 'test',
        entity: 'Department',
        entityId: 'some-id',
      },
    });

    // Attempting update on AuditLog should fail with permission denied
    await expect(
      appDb.withTenant(tenantA, (tx) =>
        tx.$executeRaw`UPDATE "AuditLog" SET action = 'tampered' WHERE id = ${log.id}::uuid`,
      ),
    ).rejects.toThrow();

    // Attempting delete on AuditLog should fail with permission denied
    await expect(
      appDb.withTenant(tenantA, (tx) =>
        tx.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${log.id}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it('loginLookup finds user across tenants', async () => {
    const user = await appDb.loginLookup('USERB@BAYANIHAN.TEST');
    expect(user).not.toBeNull();
    expect(user?.tenantId).toBe(tenantB);
    expect(user?.passwordHash).toBe('hashed_pw_b');
    expect(user?.active).toBe(true);

    const missing = await appDb.loginLookup('nonexistent@test.com');
    expect(missing).toBeNull();
  });
});
