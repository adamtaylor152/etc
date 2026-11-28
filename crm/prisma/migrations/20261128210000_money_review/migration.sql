-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tipRefundedCents" INTEGER NOT NULL DEFAULT 0;
