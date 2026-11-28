-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "checklistTemplateId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "checklistTemplateId" TEXT;

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitChecklist" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_businessId_idx" ON "ChecklistTemplate"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitChecklist_visitId_key" ON "VisitChecklist"("visitId");
