-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'CREW');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('LOGIN', 'OWNER_DEEP_LINK', 'QUOTE', 'INVOICE', 'CLIENT_HUB', 'PHOTO_UPLOAD', 'VISIT_REPORT');

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('BOOKING_FORM', 'MANUAL', 'PHONE', 'REFERRAL', 'CLIENT_HUB', 'IMPORT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'ETRANSFER', 'CARD', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "GeocodeSource" AS ENUM ('PLACES_AUTOCOMPLETE', 'GOOGLE_GEOCODING', 'MANUAL_PIN', 'NONE');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('SNOW', 'CLEANUP', 'WASHING', 'FIXUP', 'ADDON', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'QUOTE');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('EACH', 'VISIT', 'PUSH', 'HOUR', 'SEASON');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'ASSESSMENT_SCHEDULED', 'CONVERTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SnowPlanChoice" AS ENUM ('ONE_TIME', 'EVERY_SNOWFALL');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'AWAITING_RESPONSE', 'CHANGES_REQUESTED', 'APPROVED', 'CONVERTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ONE_OFF', 'RECURRING', 'SNOW_PLAN');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('FIXED_PRICE', 'PER_VISIT');

-- CreateEnum
CREATE TYPE "InvoiceSchedule" AS ENUM ('AFTER_EACH_VISIT', 'PER_SNOW_EVENT', 'MONTHLY', 'ON_COMPLETION', 'MANUAL');

-- CreateEnum
CREATE TYPE "SnowBillingMode" AS ENUM ('PER_PUSH', 'PER_EVENT', 'SEASONAL');

-- CreateEnum
CREATE TYPE "VisitState" AS ENUM ('SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitSource" AS ENUM ('MANUAL', 'BOOKING', 'RECURRENCE', 'SNOW_EVENT');

-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('ALREADY_CLEARED', 'BLOCKED_BY_CAR', 'NO_ACCESS', 'BELOW_TRIGGER', 'CLIENT_CANCELLED', 'WEATHER', 'OTHER');

-- CreateEnum
CREATE TYPE "SnowEventStatus" AS ENUM ('FORECAST', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'BAD_DEBT', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('DUE_ON_RECEIPT', 'NET_7', 'NET_15', 'NET_30');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('BEFORE', 'AFTER', 'REQUEST_PHOTO', 'PROOF', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'PDF');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CLIENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "CounterKind" AS ENUM ('REQUEST', 'QUOTE', 'JOB', 'INVOICE', 'SNOW_EVENT');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "helpEmail" TEXT,
    "etransferEmail" TEXT,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Edmonton',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "taxRegistered" BOOLEAN NOT NULL DEFAULT false,
    "taxName" TEXT NOT NULL DEFAULT 'GST',
    "taxRateBps" INTEGER NOT NULL DEFAULT 500,
    "taxNumber" TEXT,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
    "defaultPaymentTerms" "PaymentTerms" NOT NULL DEFAULT 'DUE_ON_RECEIPT',
    "depotAddress" TEXT,
    "depotLat" DOUBLE PRECISION,
    "depotLng" DOUBLE PRECISION,
    "googleReviewUrl" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkToken" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "requestId" TEXT,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "jobId" TEXT,
    "visitId" TEXT,
    "redirectPath" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "altEmails" TEXT[],
    "phone" TEXT,
    "preferredPayment" "PaymentMethod",
    "source" "ClientSource" NOT NULL,
    "referredBy" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
    "emailBouncedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT,
    "formatted" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "line1" TEXT,
    "postalCode" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Calgary',
    "province" TEXT NOT NULL DEFAULT 'AB',
    "placeId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geocodeSource" "GeocodeSource" NOT NULL DEFAULT 'NONE',
    "communityCode" TEXT,
    "accessNotes" TEXT,
    "gateCode" TEXT,
    "petNotes" TEXT,
    "hazards" TEXT,
    "routeSort" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "class" TEXT,
    "geometry" JSONB NOT NULL,
    "centroidLat" DOUBLE PRECISION NOT NULL,
    "centroidLng" DOUBLE PRECISION NOT NULL,
    "sourceDate" TEXT NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ServiceCommunity" (
    "businessId" TEXT NOT NULL,
    "communityCode" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceCommunity_pkey" PRIMARY KEY ("businessId","communityCode")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bookingLabel" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "pricingMode" "PricingMode" NOT NULL,
    "unitPriceCents" INTEGER,
    "unit" "PriceUnit" NOT NULL DEFAULT 'EACH',
    "isAddon" BOOLEAN NOT NULL DEFAULT false,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "source" "ClientSource" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "title" TEXT NOT NULL,
    "services" TEXT[],
    "snowPlan" "SnowPlanChoice",
    "iceMelt" BOOLEAN NOT NULL DEFAULT false,
    "preferredDate" DATE,
    "preferredPayment" "PaymentMethod",
    "notes" TEXT,
    "accessNotes" TEXT,
    "estimateText" TEXT,
    "rawPayload" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "legacyBookingId" INTEGER,
    "assessmentAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "requestId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "message" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "validUntil" DATE,
    "sentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "approvedIp" TEXT,
    "changesRequestedAt" TIMESTAMP(3),
    "changeRequestMessage" TEXT,
    "convertedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(9,2) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "defaultTriggerCm" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnowEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SnowEventStatus" NOT NULL DEFAULT 'FORECAST',
    "forecastCm" INTEGER,
    "measuredCm" INTEGER,
    "snowStartedAt" TIMESTAMP(3),
    "snowEndedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pushCount" INTEGER NOT NULL DEFAULT 1,
    "forecastSnapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "requestId" TEXT,
    "quoteId" TEXT,
    "seasonId" TEXT,
    "kind" "JobKind" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "billingType" "BillingType" NOT NULL DEFAULT 'PER_VISIT',
    "invoiceSchedule" "InvoiceSchedule" NOT NULL DEFAULT 'AFTER_EACH_VISIT',
    "totalCents" INTEGER,
    "rrule" TEXT,
    "recurrenceStartsOn" DATE,
    "recurrenceEndsOn" DATE,
    "asNeeded" BOOLEAN NOT NULL DEFAULT false,
    "anytime" BOOLEAN NOT NULL DEFAULT true,
    "defaultStartMinute" INTEGER,
    "defaultDurationMin" INTEGER,
    "triggerCm" INTEGER,
    "snowBillingMode" "SnowBillingMode",
    "pricePerPushCents" INTEGER,
    "seasonalPriceCents" INTEGER,
    "iceMelt" BOOLEAN NOT NULL DEFAULT false,
    "planPausedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLineItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(9,2) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "perVisit" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snowEventId" TEXT,
    "pushNumber" INTEGER,
    "scheduledDate" DATE,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "anytime" BOOLEAN NOT NULL DEFAULT true,
    "state" "VisitState" NOT NULL DEFAULT 'SCHEDULED',
    "routeSort" INTEGER,
    "assigneeId" TEXT,
    "source" "VisitSource" NOT NULL DEFAULT 'MANUAL',
    "recurrenceDate" DATE,
    "detachedFromRecurrence" BOOLEAN NOT NULL DEFAULT false,
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedLat" DOUBLE PRECISION,
    "completedLng" DOUBLE PRECISION,
    "skippedAt" TIMESTAMP(3),
    "skipReason" "SkipReason",
    "skipNote" TEXT,
    "depthCm" INTEGER,
    "iceMeltApplied" BOOLEAN,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitCharge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(9,2) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "invoiceLineItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "jobId" TEXT,
    "snowEventId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "message" TEXT,
    "issuedOn" DATE,
    "dueOn" DATE,
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'DUE_ON_RECEIPT',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "etransferRef" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "badDebtAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "stripeCheckoutSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "jobId" TEXT,
    "visitId" TEXT,
    "serviceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceDate" DATE,
    "quantity" DECIMAL(9,2) NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "note" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "capturedLat" DOUBLE PRECISION,
    "capturedLng" DOUBLE PRECISION,
    "uploadedByType" "ActorType" NOT NULL,
    "uploadedById" TEXT,
    "clientId" TEXT,
    "propertyId" TEXT,
    "requestId" TEXT,
    "quoteId" TEXT,
    "jobId" TEXT,
    "visitId" TEXT,
    "caption" TEXT,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "showcase" BOOLEAN NOT NULL DEFAULT false,
    "showcaseConsentAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "propertyId" TEXT,
    "requestId" TEXT,
    "quoteId" TEXT,
    "jobId" TEXT,
    "visitId" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorClientId" TEXT,
    "type" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "clientId" TEXT,
    "jobId" TEXT,
    "snowEventId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "to" TEXT NOT NULL,
    "cc" TEXT[],
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "props" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "clientId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplateOverride" (
    "businessId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "intro" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmailTemplateOverride_pkey" PRIMARY KEY ("businessId","template")
);

-- CreateTable
CREATE TABLE "Counter" (
    "businessId" TEXT NOT NULL,
    "kind" "CounterKind" NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("businessId","kind")
);

-- CreateTable
CREATE TABLE "WeatherSnapshot" (
    "id" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "WeatherSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_businessId_email_key" ON "User"("businessId", "email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkToken_tokenHash_key" ON "LinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "LinkToken_businessId_purpose_idx" ON "LinkToken"("businessId", "purpose");

-- CreateIndex
CREATE INDEX "Client_businessId_email_idx" ON "Client"("businessId", "email");

-- CreateIndex
CREATE INDEX "Property_businessId_normalized_idx" ON "Property"("businessId", "normalized");

-- CreateIndex
CREATE INDEX "Property_businessId_communityCode_idx" ON "Property"("businessId", "communityCode");

-- CreateIndex
CREATE UNIQUE INDEX "Service_businessId_key_key" ON "Service"("businessId", "key");

-- CreateIndex
CREATE INDEX "Request_businessId_status_idx" ON "Request"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Request_businessId_number_key" ON "Request"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Request_businessId_legacyBookingId_key" ON "Request"("businessId", "legacyBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_jobId_key" ON "Quote"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_businessId_number_key" ON "Quote"("businessId", "number");

-- CreateIndex
CREATE INDEX "Job_businessId_kind_seasonId_idx" ON "Job"("businessId", "kind", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_businessId_number_key" ON "Job"("businessId", "number");

-- CreateIndex
CREATE INDEX "Visit_businessId_scheduledDate_idx" ON "Visit"("businessId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_jobId_snowEventId_pushNumber_key" ON "Visit"("jobId", "snowEventId", "pushNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_jobId_recurrenceDate_key" ON "Visit"("jobId", "recurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "VisitCharge_invoiceLineItemId_key" ON "VisitCharge"("invoiceLineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_number_key" ON "Invoice"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_etransferRef_key" ON "Invoice"("businessId", "etransferRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ActivityEvent_businessId_entityType_entityId_idx" ON "ActivityEvent"("businessId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityEvent_businessId_clientId_idx" ON "ActivityEvent"("businessId", "clientId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_nextAttemptAt_idx" ON "EmailMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_businessId_dedupeKey_key" ON "EmailMessage"("businessId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_communityCode_fkey" FOREIGN KEY ("communityCode") REFERENCES "Community"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCommunity" ADD CONSTRAINT "ServiceCommunity_communityCode_fkey" FOREIGN KEY ("communityCode") REFERENCES "Community"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnowEvent" ADD CONSTRAINT "SnowEvent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_snowEventId_fkey" FOREIGN KEY ("snowEventId") REFERENCES "SnowEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCharge" ADD CONSTRAINT "VisitCharge_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitCharge" ADD CONSTRAINT "VisitCharge_invoiceLineItemId_fkey" FOREIGN KEY ("invoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_snowEventId_fkey" FOREIGN KEY ("snowEventId") REFERENCES "SnowEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One open every-snowfall plan per property per season.
CREATE UNIQUE INDEX "Job_one_open_snow_plan" ON "Job" ("propertyId", "seasonId") WHERE "kind" = 'SNOW_PLAN' AND "closedAt" IS NULL;
