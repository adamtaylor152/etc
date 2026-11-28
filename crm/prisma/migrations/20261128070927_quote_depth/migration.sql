-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "discountType" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "discountValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "lastSentVia" TEXT NOT NULL DEFAULT 'EMAIL';

-- CreateTable
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "depositType" TEXT NOT NULL DEFAULT 'NONE',
    "depositValue" INTEGER NOT NULL DEFAULT 0,
    "depositRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteTemplate_businessId_name_key" ON "QuoteTemplate"("businessId", "name");

-- Existing dollar discounts: the value mirrors the computed amount.
UPDATE "Quote" SET "discountValue" = "discountCents" WHERE "discountCents" > 0;
