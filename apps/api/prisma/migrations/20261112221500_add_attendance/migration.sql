-- CreateEnum
CREATE TYPE "WorkLocationType" AS ENUM ('OFFICE', 'FIELD_CLIENT_SITE', 'REMOTE_WFH');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('WEB_PUNCH', 'BIOMETRIC_IMPORT', 'CORRECTION_OB');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'UNDERTIME', 'ABSENT', 'ON_LEAVE', 'OFFICIAL_BUSINESS', 'REST_DAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('MISSED_PUNCH', 'OFFICIAL_BUSINESS');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "locationType" "WorkLocationType" NOT NULL DEFAULT 'OFFICE',
    "source" "AttendanceSource" NOT NULL DEFAULT 'WEB_PUNCH',
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "notes" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrectionRequest" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "CorrectionType" NOT NULL DEFAULT 'MISSED_PUNCH',
    "proposedTimeIn" TIMESTAMP(3),
    "proposedTimeOut" TIMESTAMP(3),
    "locationType" "WorkLocationType" NOT NULL DEFAULT 'FIELD_CLIENT_SITE',
    "destination" VARCHAR(255),
    "reason" VARCHAR(500) NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_tenantId_date_idx" ON "AttendanceRecord"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_tenantId_employeeId_date_key" ON "AttendanceRecord"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_tenantId_employeeId_idx" ON "AttendanceCorrectionRequest"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_tenantId_status_idx" ON "AttendanceCorrectionRequest"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Row Level Security (RLS) for tenant isolation
ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "AttendanceRecord"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "AttendanceCorrectionRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON "AttendanceCorrectionRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
