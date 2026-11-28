-- CreateTable
CREATE TABLE "VisitExtra" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "addedByClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitExtra_visitId_serviceKey_key" ON "VisitExtra"("visitId", "serviceKey");

-- AddForeignKey
ALTER TABLE "VisitExtra" ADD CONSTRAINT "VisitExtra_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
