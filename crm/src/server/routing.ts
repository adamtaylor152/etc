// Route order: communities in the business's service-area order (Evergreen first), then each property's
// standing routeSort (set by auto-order / up-down moves, reused every storm), then address.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

const include = {
  property: { include: { community: true } },
  job: { include: { client: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } } } },
  snowEvent: { select: { id: true, name: true } },
} satisfies Prisma.VisitInclude;
export type RouteVisit = Prisma.VisitGetPayload<{ include: typeof include }>;

export async function routeVisits(businessId: string, where: Prisma.VisitWhereInput) {
  const [visits, order] = await Promise.all([
    db.visit.findMany({ where: { businessId, ...where }, include }),
    db.serviceCommunity.findMany({ where: { businessId }, select: { communityCode: true, sortOrder: true } }),
  ]);
  const rank = new Map(order.map((o) => [o.communityCode, o.sortOrder]));
  const big = Number.MAX_SAFE_INTEGER;
  visits.sort((a, b) =>
    (rank.get(a.property.communityCode ?? "") ?? big) - (rank.get(b.property.communityCode ?? "") ?? big)
    || (a.property.routeSort ?? big) - (b.property.routeSort ?? big)
    || a.property.formatted.localeCompare(b.property.formatted));
  // Group, keeping order.
  const groups: { name: string; code: string | null; visits: RouteVisit[] }[] = [];
  for (const v of visits) {
    const code = v.property.communityCode;
    const last = groups.at(-1);
    if (last && last.code === code) last.visits.push(v);
    else groups.push({ name: v.property.community?.name ?? "No community (needs a map pin)", code, visits: [v] });
  }
  return { visits, groups };
}

export const mapsLink = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
