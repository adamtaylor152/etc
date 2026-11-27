// Seed / re-seed reference data. Safe to run repeatedly (upserts): `pnpm prisma db seed`
//  - the etc. business + owners from OWNER_EMAILS
//  - the price book (matches book.html's services and today's prices)
//  - City of Calgary community boundaries + our service area (from etccrew.ca's "Service area" list)
//  - the current winter season
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type ServiceCategory } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const slug = process.env.BUSINESS_SLUG ?? "etc";

const SERVICES: [key: string, label: string, category: ServiceCategory, cents: number | null, extra?: Partial<Prisma.ServiceCreateInput>][] = [
  ["snow_once", "Snow shovelling", "SNOW", 3500, { name: "Snow shovelling (one-time)", unit: "VISIT" }],
  ["snow_plan_push", "Snow shovelling", "SNOW", 3000, { name: "Snow shovelling, every snowfall (per push)", unit: "PUSH", bookable: false }],
  ["ice_melt", "Ice melt", "ADDON", 500, { isAddon: true, bookable: false }],
  ["commercial_snow", "Commercial snow removal", "SNOW", null],
  ["roof_snow", "Roof snow removal", "SNOW", null],
  ["bin_cleaning", "Bin cleaning", "CLEANUP", null],
  ["window_cleaning", "Window cleaning", "WASHING", null],
  ["leaf_yard", "Leaf & yard clutter removal", "CLEANUP", null],
  ["junk_removal", "Trash & junk removal", "CLEANUP", null],
  ["concrete_wash", "Driveway / concrete washing", "WASHING", null],
  ["deck_fence_clean", "Deck & fence cleaning", "WASHING", null],
  ["house_wash", "House & siding wash", "WASHING", null],
  ["rust_stain", "Rust stain removal", "WASHING", null],
  ["building_wash", "Building washing", "WASHING", null],
  ["fence_repair", "Fence repair", "FIXUP", null],
  ["other", "Something else", "OTHER", null],
];

// From etccrew.ca's Service area section, in rough route order out from Evergreen.
const SERVICE_AREA = [
  "EVERGREEN", "BRIDLEWOOD", "SHAWNESSY", "MILLRISE", "SOMERSET", "SILVERADO", "WOODBINE", "WOODLANDS", "SHAWNEE SLOPES",
  "CANYON MEADOWS", "BELMONT", "YORKVILLE", "PINE CREEK", "CEDARBRAE", "BRAESIDE", "OAKRIDGE", "PALLISER", "HAYSBORO",
  "SOUTHWOOD", "WILLOW PARK", "MAPLE RIDGE", "ACADIA", "KINGSLAND", "SUNDANCE", "WALDEN", "LEGACY", "WOLF WILLOW",
  "SIGNAL HILL", "WEST SPRINGS", "CHRISTIE PARK", "STRATHCONA PARK", "LAKE BONAVISTA", "CHAPARRAL", "MIDNAPORE",
  "DIAMOND COVE", "PUMP HILL", "BAYVIEW", "EAGLE RIDGE", "KELVIN GROVE", "LAKEVIEW", "NORTH GLENMORE PARK", "BRITANNIA",
  "ELBOYA", "MAYFAIR", "BEL-AIRE", "MEADOWLARK PARK", "ELBOW PARK", "RIDEAU PARK", "ROXBORO", "UPPER MOUNT ROYAL",
  "LOWER MOUNT ROYAL", "ALTADORE", "GARRISON WOODS", "ASPEN WOODS", "SPRINGBANK HILL", "DISCOVERY RIDGE",
];

// "LOWER MOUNT ROYAL" -> "Lower Mount Royal", "BEL-AIRE" -> "Bel-Aire"
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

type Geo = { type: "MultiPolygon" | "Polygon"; coordinates: number[][][][] | number[][][] };
function centroid(g: Geo): [lat: number, lng: number] {
  // ponytail: average of the largest outer ring's vertices. Good enough for ordering communities on a route.
  const rings = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
  const outer = rings.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
  const [x, y] = outer.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
  return [y / outer.length, x / outer.length];
}

async function main() {
  const biz = await db.business.upsert({
    where: { slug },
    create: {
      slug, name: "etc.", email: process.env.OWNER_EMAILS?.split(",")[0]?.trim() || null, phone: "403-656-8200",
      helpEmail: process.env.HELP_EMAIL ?? "help@etccrew.ca", etransferEmail: process.env.ETRANSFER_EMAIL || null,
      website: "https://etccrew.ca", depotAddress: "Evergreen, Calgary", depotLat: 50.9130, depotLng: -114.1170,
    },
    update: {},
  });

  for (const email of (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)) {
    await db.user.upsert({ where: { businessId_email: { businessId: biz.id, email } }, create: { businessId: biz.id, email, role: "OWNER" }, update: { active: true } });
  }

  for (const [i, [key, label, category, cents, extra]] of SERVICES.entries()) {
    const data = {
      name: label, bookingLabel: label, category, pricingMode: cents == null ? "QUOTE" : "FIXED", unitPriceCents: cents, sortOrder: i, ...extra,
    } as Omit<Prisma.ServiceUncheckedCreateInput, "businessId" | "key">;
    await db.service.upsert({ where: { businessId_key: { businessId: biz.id, key } }, create: { businessId: biz.id, key, ...data }, update: {} });
  }

  const gj = JSON.parse(readFileSync(new URL("./data/communities.geojson", import.meta.url), "utf8"));
  for (const f of gj.features) {
    const p = f.properties;
    const [lat, lng] = centroid(f.geometry);
    const data = { name: titleCase(p.name), sector: p.sector, class: p.class, geometry: f.geometry, centroidLat: lat, centroidLng: lng, sourceDate: (p.modified_dt ?? "").slice(0, 10) };
    await db.community.upsert({ where: { code: p.comm_code }, create: { code: p.comm_code, ...data }, update: data });
  }
  const byName = new Map((await db.community.findMany({ select: { code: true, name: true } })).map((c) => [c.name.toUpperCase(), c.code]));
  const missing: string[] = [];
  for (const [i, name] of SERVICE_AREA.entries()) {
    const code = byName.get(name);
    if (!code) { missing.push(name); continue; }
    await db.serviceCommunity.upsert({
      where: { businessId_communityCode: { businessId: biz.id, communityCode: code } },
      create: { businessId: biz.id, communityCode: code, sortOrder: i }, update: {},
    });
  }

  const now = new Date();
  const startY = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const startsOn = new Date(`${startY}-10-01T00:00:00Z`);
  if (!(await db.season.findFirst({ where: { businessId: biz.id, startsOn } }))) {
    await db.season.create({ data: { businessId: biz.id, name: `Winter ${startY}–${String(startY + 1).slice(2)}`, startsOn, endsOn: new Date(`${startY + 1}-04-30T00:00:00Z`) } });
  }

  console.log(`seeded ${biz.name}: ${SERVICES.length} services, ${gj.features.length} communities, service area ${SERVICE_AREA.length - missing.length}${missing.length ? ` (not found: ${missing.join(", ")})` : ""}`);
}

main().finally(() => db.$disconnect());
