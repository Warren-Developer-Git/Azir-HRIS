-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "avatarKey" TEXT;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "attachmentName" TEXT;
