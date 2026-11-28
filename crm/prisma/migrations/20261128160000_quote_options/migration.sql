-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "chosenOption" TEXT,
ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN     "optionKey" TEXT,
ADD COLUMN     "photoId" TEXT;

-- AlterTable
ALTER TABLE "QuoteTemplate" ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]';
