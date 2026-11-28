-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "routePriority" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "endAddress" TEXT,
ADD COLUMN     "endLat" DOUBLE PRECISION,
ADD COLUMN     "endLng" DOUBLE PRECISION,
ADD COLUMN     "startAddress" TEXT,
ADD COLUMN     "startLat" DOUBLE PRECISION,
ADD COLUMN     "startLng" DOUBLE PRECISION;

-- Visit.routeSort used to be a copy of the property's standing order taken when the visit was made (never read for
-- the route). It now means "this visit was reordered for its day only", so clear the old copies.
UPDATE "Visit" SET "routeSort" = NULL WHERE "routeSort" IS NOT NULL;
