-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "gstCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendor" TEXT;
