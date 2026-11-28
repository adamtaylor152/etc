-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "defaultAssigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "invoiceDay" INTEGER,
ADD COLUMN     "pausedFrom" DATE,
ADD COLUMN     "pausedUntil" DATE;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "lineOverrides" JSONB;
