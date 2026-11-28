// Route order: communities in the business's order (Settings › Route), "do first" properties at the front of each,
// then the visit's own routeSort (a "today only" reorder) or else the property's standing routeSort (auto-order /
// "every time" reorders, reused every storm), then address.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { travelMatrix } from "./routing-matrix";
import { routeTimes } from "./routing/eta";
import type { LatLng } from "./routing/order";
import { parseSettings } from "./settings";
import { isSnowVisit, usualByProperty, usualKey } from "./ops/visit-times";

const include = {
  property: { include: { community: true } },
  job: { include: { client: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } } } },
  snowEvent: { select: { id: true, name: true } },
  assignees: { select: { userId: true } },
} satisfies Prisma.VisitInclude;
export type RouteVisit = Prisma.VisitGetPayload<{ include: typeof include }>;

export async function routeVisits(businessId: string, where: Prisma.VisitWhereInput) {
  const [visits, order] = await Promise.all([
    db.visit.findMany({ where: { businessId, job: { sizeHoldAt: null }, ...where }, include }), // held for a new-price OK: off the route
    db.serviceCommunity.findMany({ where: { businessId }, select: { communityCode: true, sortOrder: true } }),
  ]);
  const rank = new Map(order.map((o) => [o.communityCode, o.sortOrder]));
  const big = Number.MAX_SAFE_INTEGER;
  const key = (v: RouteVisit) => v.routeSort ?? v.property.routeSort ?? big;
  visits.sort((a, b) =>
    (rank.get(a.property.communityCode ?? "") ?? big) - (rank.get(b.property.communityCode ?? "") ?? big)
    || Number(b.property.routePriority) - Number(a.property.routePriority)
    || key(a) - key(b)
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

export const pointOf = (lat: number | null, lng: number | null): LatLng | null => (lat != null && lng != null ? { lat, lng } : null);
export const depotOf = (biz: { depotLat: number | null; depotLng: number | null }): LatLng => ({ lat: biz.depotLat ?? 50.913, lng: biz.depotLng ?? -114.117 });

/** Where someone's route starts and ends: their own points (Settings › Team), else the depot. */
export async function routeEnds(businessId: string, userId?: string | null) {
  const [biz, u] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { depotLat: true, depotLng: true } }),
    userId ? db.user.findFirst({ where: { id: userId, businessId } }) : null,
  ]);
  const depot = depotOf(biz);
  return { start: (u && pointOf(u.startLat, u.startLng)) ?? depot, end: (u && pointOf(u.endLat, u.endLng)) ?? depot };
}

/**
 * Times for stops already in route order, setting off at `startAt`. Each person drives their own stops from their own
 * start point (unassigned stops are one more route from the depot); `oneRoute` treats the lot as a single route.
 * Stops without a map pin add service time but no driving. Time at a stop is what that property usually takes once
 * it has enough timed visits (ops/visit-times.ts; `usual` has those), else the flat "minutes at a stop" setting.
 */
export async function routeEtas(businessId: string, visits: RouteVisit[], startAt: Date, opts: { oneRoute?: boolean } = {}) {
  const [biz, users] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { depotLat: true, depotLng: true, settings: true } }),
    db.user.findMany({ where: { businessId } }),
  ]);
  const serviceMin = parseSettings(biz.settings).serviceMinutes, depot = depotOf(biz);
  const byProperty = await usualByProperty(businessId, visits.map((v) => v.propertyId));
  const usual = new Map(visits.flatMap((v) => { const u = v.isReturn ? null : byProperty.get(usualKey(v.propertyId, isSnowVisit(v))); return u == null ? [] : [[v.id, u] as const]; }));
  const stopMin = (v: RouteVisit) => usual.get(v.id) ?? serviceMin;
  const chains = new Map<string, RouteVisit[]>();
  for (const v of visits) {
    const who = opts.oneRoute ? "" : v.assignees[0]?.userId ?? "";
    chains.set(who, [...(chains.get(who) ?? []), v]);
  }
  const stops = new Map<string, { eta: Date; driveMin: number; serviceMin: number }>();
  const people: { id: string; name: string; color: string; stops: number; driveMin: number; totalMin: number; finish: Date; path: LatLng[] }[] = [];
  let road = visits.length > 0;
  for (const [who, list] of chains) {
    const u = users.find((x) => x.id === who);
    const start = (u && pointOf(u.startLat, u.startLng)) ?? depot, end = (u && pointOf(u.endLat, u.endLng)) ?? depot;
    const pinned = list.filter((v) => v.property.lat != null && v.property.lng != null);
    const pts = [start, ...pinned.map((v) => ({ lat: v.property.lat!, lng: v.property.lng! })), end];
    const m = await travelMatrix(pts);
    road &&= m.road;
    let at = 0; // index into pts of where the crew is
    const drive = list.map((v) => { const i = pinned.indexOf(v) + 1; if (!i) return 0; const d = m.minutes[at][i]; at = i; return d; });
    const t = routeTimes(drive, list.map(stopMin), m.minutes[at][pts.length - 1]);
    list.forEach((v, i) => stops.set(v.id, { eta: new Date(startAt.getTime() + t.arrive[i] * 60_000), driveMin: drive[i], serviceMin: stopMin(v) }));
    people.push({
      id: who, name: u ? u.name || u.email.split("@")[0] : "Unassigned", color: u?.color ?? "#14213d", stops: list.length,
      driveMin: t.driveMin, totalMin: t.totalMin, finish: new Date(startAt.getTime() + t.totalMin * 60_000), path: pts.slice(0, -1),
    });
  }
  return { stops, people, road, serviceMin, usual };
}
