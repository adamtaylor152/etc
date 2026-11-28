-- CreateEnum
CREATE TYPE "SignatureKind" AS ENUM ('QUOTE', 'VISIT', 'INVOICE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "requireSignature" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "SignatureKind" NOT NULL,
    "quoteId" TEXT,
    "visitId" TEXT,
    "invoiceId" TEXT,
    "attachmentId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "docHash" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "inPerson" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signature_quoteId_idx" ON "Signature"("quoteId");

-- CreateIndex
CREATE INDEX "Signature_visitId_idx" ON "Signature"("visitId");

-- CreateIndex
CREATE INDEX "Signature_invoiceId_idx" ON "Signature"("invoiceId");
