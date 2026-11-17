-- CreateEnum
CREATE TYPE "PayrollPeriodType" AS ENUM ('FIRST_HALF', 'SECOND_HALF', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'COMPUTED', 'APPROVED', 'LOCKED', 'PAID');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('OVERTIME_HOURS', 'BONUS', 'ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "LineCategory" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "allowances" DECIMAL(12,2) NOT NULL DEFAULT 2000.00,
ADD COLUMN     "basicSalary" DECIMAL(12,2) NOT NULL DEFAULT 30000.00;

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cutoffType" "PayrollPeriodType" NOT NULL DEFAULT 'FIRST_HALF',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "workingDays" INTEGER NOT NULL DEFAULT 11,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "runNumber" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalEmployeeContributions" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "totalEmployerContributions" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "preparedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItem" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "basicPay" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "overtimePay" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "absencesDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "grossPay" DECIMAL(12,2) NOT NULL,
    "sssEe" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "sssEr" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "philHealthEe" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "philHealthEr" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pagIbigEe" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pagIbigEr" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "withholdingTax" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "otherDeductions" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "netPay" DECIMAL(12,2) NOT NULL,
    "issuedDocumentId" UUID,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollItemLine" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "payrollItemId" UUID NOT NULL,
    "category" "LineCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "rate" DECIMAL(10,2),
    "quantity" DECIMAL(8,2),

    CONSTRAINT "PayrollItemLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "payrollRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "quantity" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollPeriod_tenantId_startDate_idx" ON "PayrollPeriod"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_tenantId_startDate_endDate_key" ON "PayrollPeriod"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollRun_tenantId_status_idx" ON "PayrollRun"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_runNumber_key" ON "PayrollRun"("tenantId", "runNumber");

-- CreateIndex
CREATE INDEX "PayrollItem_tenantId_employeeId_idx" ON "PayrollItem"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollItem_payrollRunId_employeeId_key" ON "PayrollItem"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollItemLine_payrollItemId_idx" ON "PayrollItemLine"("payrollItemId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollRunId_employeeId_idx" ON "PayrollAdjustment"("payrollRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItemLine" ADD CONSTRAINT "PayrollItemLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollItemLine" ADD CONSTRAINT "PayrollItemLine_payrollItemId_fkey" FOREIGN KEY ("payrollItemId") REFERENCES "PayrollItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
-- Multi-Tenant Row Level Security (RLS) Policies
-- =========================================================================

-- Enable RLS on PayrollPeriod
ALTER TABLE "PayrollPeriod" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "PayrollPeriod"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on PayrollRun
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "PayrollRun"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on PayrollAdjustment
ALTER TABLE "PayrollAdjustment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "PayrollAdjustment"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on PayrollItem
ALTER TABLE "PayrollItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "PayrollItem"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Enable RLS on PayrollItemLine
ALTER TABLE "PayrollItemLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_policy" ON "PayrollItemLine"
  USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Permissions for App Role
GRANT USAGE ON SCHEMA public TO hrms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hrms_app;
REVOKE UPDATE, DELETE ON "AuditLog" FROM hrms_app;
