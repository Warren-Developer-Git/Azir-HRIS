# 2. Database Multi-Tenancy via PostgreSQL Row-Level Security (RLS)

Date: 2026-11-10

## Status
Accepted

## Context
Multi-tenant applications often fail when relying solely on application-level filtering (e.g. `WHERE tenantId = ...`). A single developer oversight or ORM omission can cause catastrophic data leaks across organizations.

## Decision
We enforce multi-tenancy at the PostgreSQL engine level using Row-Level Security (RLS):
1. **Dual-Role Model:**
   - `hrms_owner`: Superuser / table owner used only during schema migrations and seed scripts. Has `BYPASSRLS`.
   - `hrms_app`: Application role used by NestJS runtime. Has `NOBYPASSRLS` and limited DML permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
2. **Session Variable:**
   - Every tenant transaction sets `SET LOCAL app.current_tenant_id = '<tenant_uuid>';`.
3. **RLS Policies:**
   - Every table containing `tenantId` has RLS enabled (`ENABLE ROW LEVEL SECURITY`) and enforced (`FORCE ROW LEVEL SECURITY`).
   - Policy: `USING ("tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)`.
4. **Helper Wrapper:**
   - All NestJS database interactions run through `prismaService.withTenant(tenantId, callback)`.

## Consequences
- **Positive:** Even if a SQL query omits `WHERE tenantId = ...`, PostgreSQL filters out all other tenants automatically.
- **Trade-offs:** Every database query must be executed inside a transaction block where `app.current_tenant_id` is set.
