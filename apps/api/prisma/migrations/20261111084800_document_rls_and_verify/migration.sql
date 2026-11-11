-- Enable RLS on DocumentType
ALTER TABLE "DocumentType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "DocumentType"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on DocumentRequest
ALTER TABLE "DocumentRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "DocumentRequest"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on IssuedDocument
ALTER TABLE "IssuedDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "IssuedDocument"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Permissions
GRANT USAGE ON SCHEMA public TO hrms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hrms_app;
REVOKE UPDATE, DELETE ON "AuditLog" FROM hrms_app;

-- Public verification function
CREATE OR REPLACE FUNCTION app_verify_document(v_code text)
RETURNS TABLE (
  "documentNo" text,
  "documentType" text,
  "issuedAt" timestamp with time zone,
  "status" "IssuedDocumentStatus",
  "organization" text,
  "maskedEmployeeName" text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    d."documentNo",
    dt."name" as "documentType",
    d."issuedAt",
    d."status",
    t."name" as "organization",
    concat(e."firstName", ' ', left(e."lastName", 1), '.') as "maskedEmployeeName"
  FROM "IssuedDocument" d
  JOIN "Tenant" t ON d."tenantId" = t."id"
  JOIN "DocumentRequest" dr ON d."requestId" = dr."id"
  JOIN "DocumentType" dt ON dr."documentTypeId" = dt."id"
  JOIN "Employee" e ON dr."employeeId" = e."id"
  WHERE d."verificationCode" = v_code;
$$;

GRANT EXECUTE ON FUNCTION app_verify_document(text) TO hrms_app;
