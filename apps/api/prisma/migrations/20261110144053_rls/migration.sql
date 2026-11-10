-- Enable RLS on Tenant
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Tenant"
  USING ("id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on all tenant-owned tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "User"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Employee"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Department"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "LeaveType"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "LeaveLedgerEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "LeaveLedgerEntry"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "LeaveRequest"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "LeaveApproval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "LeaveApproval"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Holiday"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "Notification"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "AuditLog"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Schema & table permissions for hrms_app
GRANT USAGE ON SCHEMA public TO hrms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hrms_app;
REVOKE UPDATE, DELETE ON "AuditLog" FROM hrms_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrms_app;

-- Login lookup function for authentication across tenants
CREATE OR REPLACE FUNCTION app_login_lookup(p_email text)
RETURNS TABLE (
  id uuid,
  "tenantId" uuid,
  "passwordHash" text,
  active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u."tenantId", u."passwordHash", u.active
  FROM "User" u
  WHERE lower(u.email) = lower(p_email);
END;
$$;

GRANT EXECUTE ON FUNCTION app_login_lookup(text) TO hrms_app;
