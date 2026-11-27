-- CreateEnum
CREATE TYPE "UnmatchedPaymentStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "unmatchedPaymentId" TEXT;

-- CreateTable
CREATE TABLE "UnmatchedPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'ETRANSFER',
    "amountCents" INTEGER NOT NULL,
    "sender" TEXT,
    "message" TEXT,
    "providerRef" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UnmatchedPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "dismissedReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnmatchedPayment_businessId_status_idx" ON "UnmatchedPayment"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedPayment_businessId_providerRef_key" ON "UnmatchedPayment"("businessId", "providerRef");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_unmatchedPaymentId_fkey" FOREIGN KEY ("unmatchedPaymentId") REFERENCES "UnmatchedPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
