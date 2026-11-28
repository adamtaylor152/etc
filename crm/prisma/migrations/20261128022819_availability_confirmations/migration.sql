-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'VISIT_CONFIRM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workHours" JSONB NOT NULL DEFAULT '{"1":["08:00","18:00"],"2":["08:00","18:00"],"3":["08:00","18:00"],"4":["08:00","18:00"],"5":["08:00","18:00"],"6":["08:00","16:00"]}';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleRequest" TEXT,
ADD COLUMN     "rescheduleRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOff_businessId_startDate_idx" ON "TimeOff"("businessId", "startDate");
