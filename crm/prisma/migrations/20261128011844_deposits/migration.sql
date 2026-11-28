-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'DEPOSIT');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "allowPartial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appliedToInvoiceId" TEXT,
ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "quoteId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "depositRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "depositType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "depositValue" INTEGER NOT NULL DEFAULT 0;
