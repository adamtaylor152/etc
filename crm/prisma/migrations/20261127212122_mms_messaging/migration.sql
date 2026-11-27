-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE 'TEXT_PHOTO';

-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "filename" TEXT,
ADD COLUMN     "textMessageId" TEXT;

-- AlterTable
ALTER TABLE "TextMessage" ADD COLUMN     "mediaPending" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'SMS';

-- CreateIndex
CREATE INDEX "Attachment_textMessageId_idx" ON "Attachment"("textMessageId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_textMessageId_fkey" FOREIGN KEY ("textMessageId") REFERENCES "TextMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
