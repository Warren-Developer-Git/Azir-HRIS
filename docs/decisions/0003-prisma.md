# 3. Prisma ORM Integration with PostgreSQL RLS

Date: 2026-11-10

## Status
Accepted

## Context
Prisma does not natively support PostgreSQL session variables on standard query connections because connection pooling distributes queries across different connection threads.

## Decision
We implemented a transaction-scoped wrapper in `PrismaService`:
```typescript
async withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return this.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}';`
    );
    return fn(tx);
  });
}
```

## Consequences
- Guaranteed single-connection execution: `tx` maintains the connection for the entire callback duration.
- Clean TypeScript autocompletion and strong typing across all Prisma models.
