-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "instalmentKey" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "addonsIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seasonalFirstDueOn" DATE,
ADD COLUMN     "seasonalInstalments" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_instalmentKey_key" ON "Invoice"("businessId", "instalmentKey");
