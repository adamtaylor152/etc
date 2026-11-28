-- AlterTable
ALTER TABLE "ClientCredit" ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tipCents" INTEGER;
