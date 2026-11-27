-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "noteId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "emails" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "followUpInvoices" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "followUpQuotes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "leadSource" TEXT,
ADD COLUMN     "phones" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "visitReminders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "linkDownstream" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "email" TEXT,
    "isBilling" BOOLEAN NOT NULL DEFAULT false,
    "receivesTexts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT,
    "direction" "TextDirection" NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'answered',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "notes" TEXT,
    "loggedById" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_providerId_key" ON "CallLog"("providerId");

-- CreateIndex
CREATE INDEX "CallLog_businessId_clientId_startedAt_idx" ON "CallLog"("businessId", "clientId", "startedAt");

-- CreateIndex
CREATE INDEX "Attachment_noteId_idx" ON "Attachment"("noteId");

-- CreateIndex
CREATE INDEX "Note_businessId_clientId_idx" ON "Note"("businessId", "clientId");

-- CreateIndex
CREATE INDEX "Note_businessId_jobId_idx" ON "Note"("businessId", "jobId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing single phone/email become the first entry of the new lists.
UPDATE "Client" SET "phones" = jsonb_build_array(jsonb_build_object('number', "phone", 'label', 'Mobile', 'sms', true)) WHERE "phone" IS NOT NULL AND "phone" <> '';
UPDATE "Client" SET "emails" = jsonb_build_array(jsonb_build_object('address', "email", 'label', 'Main')) WHERE "email" <> '';
