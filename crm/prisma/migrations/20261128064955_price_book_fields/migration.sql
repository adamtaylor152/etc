-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "defaultDurationMin" INTEGER,
ADD COLUMN     "taxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitCostCents" INTEGER;
