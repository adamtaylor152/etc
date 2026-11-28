-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "doNotService" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "lawnSqM" INTEGER,
ADD COLUMN     "sidewalkM" INTEGER,
ADD COLUMN     "steps" INTEGER;
