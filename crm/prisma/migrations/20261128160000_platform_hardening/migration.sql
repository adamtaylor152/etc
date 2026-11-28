-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "name" TEXT NOT NULL,
    "lastOkAt" TIMESTAMP(3),
    "lastFailAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("name")
);
