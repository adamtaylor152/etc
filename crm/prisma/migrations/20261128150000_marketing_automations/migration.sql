-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "automation" TEXT,
ADD COLUMN     "automationOn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "followUpAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_businessId_automation_key" ON "Campaign"("businessId", "automation");
