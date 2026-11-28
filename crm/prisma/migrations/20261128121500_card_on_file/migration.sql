-- CreateEnum
CREATE TYPE "AutoPayState" AS ENUM ('SCHEDULED', 'RETRYING', 'NEEDS_ACTION', 'FAILED', 'PAID', 'STOPPED');

-- CreateEnum
CREATE TYPE "AutoPayAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REQUIRES_ACTION');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "autoPayConsentAt" TIMESTAMP(3),
ADD COLUMN     "autoPayConsentSource" TEXT,
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardExpMonth" INTEGER,
ADD COLUMN     "cardExpYear" INTEGER,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "cardPaymentMethodId" TEXT,
ADD COLUMN     "cardSavedAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "autoPayOn" DATE,
ADD COLUMN     "autoPayState" "AutoPayState";

-- CreateTable
CREATE TABLE "AutoPayAttempt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "AutoPayAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentMethodId" TEXT NOT NULL,
    "cardLabel" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutoPayAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoPayAttempt_status_idx" ON "AutoPayAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AutoPayAttempt_invoiceId_n_key" ON "AutoPayAttempt"("invoiceId", "n");

-- AddForeignKey
ALTER TABLE "AutoPayAttempt" ADD CONSTRAINT "AutoPayAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
