-- CreateEnum
CREATE TYPE "DocumentTypeCode" AS ENUM ('COE', 'COE_COMPENSATION', 'LEAVE_CERT', 'PAYSLIP');

-- CreateEnum
CREATE TYPE "DocumentRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IssuedDocumentStatus" AS ENUM ('VALID', 'REVOKED');

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "code" "DocumentTypeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "includesSalary" BOOLEAN NOT NULL DEFAULT false,
    "slaDays" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "payPeriod" TEXT,
    "status" "DocumentRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedDocument" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenantId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "documentNo" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" UUID NOT NULL,
    "status" "IssuedDocumentStatus" NOT NULL DEFAULT 'VALID',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_tenantId_code_key" ON "DocumentType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DocumentRequest_tenantId_employeeId_idx" ON "DocumentRequest"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "DocumentRequest_tenantId_status_idx" ON "DocumentRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_requestId_key" ON "IssuedDocument"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_verificationCode_key" ON "IssuedDocument"("verificationCode");

-- CreateIndex
CREATE INDEX "IssuedDocument_tenantId_verificationCode_idx" ON "IssuedDocument"("tenantId", "verificationCode");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_tenantId_documentNo_key" ON "IssuedDocument"("tenantId", "documentNo");

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DocumentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
