-- CreateEnum
CREATE TYPE "TextDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "smsOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TextMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT,
    "direction" "TextDirection" NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerId" TEXT,
    "error" TEXT,
    "sentById" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TextMessage_providerId_key" ON "TextMessage"("providerId");

-- CreateIndex
CREATE INDEX "TextMessage_businessId_clientId_createdAt_idx" ON "TextMessage"("businessId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "TextMessage_businessId_direction_readAt_idx" ON "TextMessage"("businessId", "direction", "readAt");

-- AddForeignKey
ALTER TABLE "TextMessage" ADD CONSTRAINT "TextMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
