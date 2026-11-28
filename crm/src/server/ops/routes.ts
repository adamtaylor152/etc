// The standing route: every property's routeSort, reused every storm. Auto-order walks communities in the business's
// order and orders stops inside each by drive time (road matrix when ROUTING_URL is set, straight-line otherwise),
// starting from the depot or a person's own start point. A day can also be reordered on its own (Visit.routeSort).
import { db } from "../db";
import { routeEnds } from "../routing";
import { travelMatrix } from "../routing-matrix";
import { matrixDist, orderGroup, type LatLng } from "../routing/order";

type Actor = { id: string; businessId: string };
const openJobs = { archivedAt: null, jobs: { some: { closedAt: null } } };

/** Re-number Property.routeSort for every property that has open work. Returns how many were ordered. */
export async function autoOrderRoute(user: Actor, fromUserId?: string | null) {
  const { start, end } = await routeEnds(user.businessId, fromUserId);
  const order = new Map((await db.serviceCommunity.findMany({ where: { businessId: user.businessId } })).map((s) => [s.communityCode, s.sortOrder]));
  const props = await db.property.findMany({
    where: { businessId: user.businessId, ...openJobs },
    select: { id: true, lat: true, lng: true, communityCode: true, formatted: true, routePriority: true },
  });
  const groups = new Map<string, typeof props>();
  for (const p of props) groups.set(p.communityCode ?? "", [...(groups.get(p.communityCode ?? "") ?? []), p]);
  const codes = [...groups.keys()].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.localeCompare(b));
  let at: LatLng = start;
  let n = 0;
  const updates: { id: string; routeSort: number }[] = [];
  for (const [i, code] of codes.entries()) {
    const list = groups.get(code)!;
    const pinned = list.filter((p) => p.lat != null && p.lng != null).map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, priority: p.routePriority }));
    const last = i === codes.length - 1 ? end : null; // only the final community is pulled toward where the day ends
    const pts = [at, ...pinned, ...(last ? [last] : [])];
    const ordered = orderGroup(at, pinned, matrixDist(pts, (await travelMatrix(pts)).minutes), last);
    const noPin = list.filter((p) => p.lat == null || p.lng == null).sort((a, b) => a.formatted.localeCompare(b.formatted));
    for (const p of [...ordered, ...noPin]) updates.push({ id: p.id, routeSort: (n += 10) });
    if (ordered.length) at = ordered.at(-1)!;
  }
  await db.$transaction([
    ...updates.map((u) => db.property.update({ where: { id: u.id }, data: { routeSort: u.routeSort } })),
    // A fresh standing order replaces any "today only" tweaks on stops still to do.
    db.visit.updateMany({ where: { businessId: user.businessId, state: { in: ["SCHEDULED", "EN_ROUTE"] }, routeSort: { not: null } }, data: { routeSort: null } }),
  ]);
  return updates.length;
}

/**
 * Save a new order for some visits in one community (the ids in the order wanted).
 * "day" touches only these visits; "always" rewrites the properties' standing order, so every future day follows it.
 */
export async function reorderStops(user: Actor, visitIds: string[], scope: "day" | "always") {
  const found = await db.visit.findMany({
    where: { id: { in: visitIds }, businessId: user.businessId },
    select: { id: true, routeSort: true, propertyId: true, property: { select: { routeSort: true, communityCode: true } } },
  });
  const visits = visitIds.flatMap((id) => found.find((v) => v.id === id) ?? []);
  const code = visits[0]?.property.communityCode ?? null;
  if (visits.length < 2 || visits.some((v) => v.property.communityCode !== code)) return;
  if (scope === "day") {
    // Hand out the places these stops already hold, so stops that aren't in the list (done, hidden) stay where they were.
    const keys = visits.map((v) => v.routeSort ?? v.property.routeSort ?? NaN).sort((a, b) => a - b);
    const usable = keys.every((k, i) => Number.isFinite(k) && (i === 0 || k > keys[i - 1]));
    await db.$transaction(visits.map((v, i) => db.visit.update({ where: { id: v.id }, data: { routeSort: usable ? keys[i] : (i + 1) * 10 } })));
    return;
  }
  const siblings = await db.property.findMany({
    where: { businessId: user.businessId, communityCode: code, ...openJobs },
    orderBy: [{ routeSort: { sort: "asc", nulls: "last" } }, { formatted: "asc" }], select: { id: true, routeSort: true },
  });
  const moving = [...new Set(visits.map((v) => v.propertyId))];
  const all = [...siblings.map((s) => s.id), ...moving.filter((id) => !siblings.some((s) => s.id === id))];
  // The moved properties take, in their new order, the slots they held between them; everyone else stays put.
  let k = 0;
  const next = all.map((id) => (moving.includes(id) ? moving[k++] : id));
  const base = Math.min(...siblings.map((s) => s.routeSort ?? Infinity).filter(Number.isFinite), 10_000);
  await db.$transaction([
    ...next.map((id, i) => db.property.update({ where: { id }, data: { routeSort: base + i * 10 } })),
    db.visit.updateMany({ where: { id: { in: visits.map((v) => v.id) } }, data: { routeSort: null } }),
  ]);
}

/** The order routes visit communities in (codes, first to last). */
export async function saveCommunityOrder(user: Actor, codes: string[]) {
  await db.$transaction(codes.map((communityCode, i) =>
    db.serviceCommunity.updateMany({ where: { businessId: user.businessId, communityCode }, data: { sortOrder: i } })));
}
