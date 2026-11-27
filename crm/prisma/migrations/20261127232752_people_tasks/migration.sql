-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('TASK', 'EVENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#1d6fd8',
ADD COLUMN     "hourlyCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "VisitAssignee" (
    "visitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "VisitAssignee_pkey" PRIMARY KEY ("visitId","userId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL DEFAULT 'TASK',
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "clientId" TEXT,
    "propertyId" TEXT,
    "jobId" TEXT,
    "date" DATE,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "repeat" TEXT,
    "seriesId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "VisitAssignee_userId_idx" ON "VisitAssignee"("userId");

-- CreateIndex
CREATE INDEX "Task_businessId_date_idx" ON "Task"("businessId", "date");

-- CreateIndex
CREATE INDEX "Task_businessId_clientId_idx" ON "Task"("businessId", "clientId");

-- CreateIndex
CREATE INDEX "Task_seriesId_idx" ON "Task"("seriesId");

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- AddForeignKey
ALTER TABLE "VisitAssignee" ADD CONSTRAINT "VisitAssignee_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitAssignee" ADD CONSTRAINT "VisitAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
