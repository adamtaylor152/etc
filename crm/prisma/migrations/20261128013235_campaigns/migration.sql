-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- DropIndex
DROP INDEX "Client_businessId_referralCode_key";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "mailingAddress" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "emailMarketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "emailMarketingConsentSource" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "smsBody" TEXT,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sendAfter" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_businessId_createdAt_idx" ON "Campaign"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_clientId_key" ON "CampaignRecipient"("campaignId", "clientId");

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
