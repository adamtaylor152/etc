-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "depthTiers" JSONB;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "iceMeltBags" DECIMAL(6,2),
ADD COLUMN     "isReturn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnPriceCents" INTEGER;
