-- CreateEnum
CREATE TYPE "DriveSize" AS ENUM ('STANDARD', 'LARGE', 'OVERSIZED');

-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'PRICE_CHANGE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "pendingPrice" JSONB,
ADD COLUMN     "sizeHoldAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "driveSize" "DriveSize",
ADD COLUMN     "extraWalk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sizeCheckedAt" TIMESTAMP(3);

-- Size prices (placeholders; edit in the price book). Bookable=false: picked by driveway size, not on the form.
INSERT INTO "Service" ("id", "businessId", "key", "name", "bookingLabel", "category", "pricingMode", "unitPriceCents", "unit", "isAddon", "bookable", "active", "sortOrder")
SELECT 'svc_' || md5(b."id" || v.key), b."id", v.key, v.name, NULL, v.cat::"ServiceCategory", 'FIXED', v.cents, v.unit::"PriceUnit", v.addon, false, true, v.sort
FROM "Business" b
CROSS JOIN (VALUES
  ('snow_once_large', 'Snow shovelling, large driveway (one-time)', 'Snow shovelling', 'SNOW', 5000, 'VISIT', false, 2),
  ('snow_plan_push_large', 'Snow shovelling, large driveway, every snowfall (per push)', 'Snow shovelling', 'SNOW', 4500, 'PUSH', false, 3),
  ('extra_walk', 'Extra sidewalk (corner lot / long walk)', 'Extra sidewalk', 'ADDON', 1000, 'VISIT', true, 4)
) AS v(key, name, label, cat, cents, unit, addon, sort)
ON CONFLICT ("businessId", "key") DO NOTHING;
