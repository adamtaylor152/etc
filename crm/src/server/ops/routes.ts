// The standing route: every property's routeSort, reused every storm. Auto-order walks communities in
// service-area order and orders stops inside each by distance, starting from the depot (home in Evergreen).
import { db } from "../db";
import { orderStops, type Pt } from "../routing/order";

type Actor = { id: string; businessId: string };

/** Re-number Property.routeSort for every property that has open work. Returns how many were ordered. */
export async function autoOrderRoute(user: Actor) {
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  const order = new Map((await db.serviceCommunity.findMany({ where: { businessId: user.businessId } })).map((s) => [s.communityCode, s.sortOrder]));
  const props = await db.property.findMany({
    where: { businessId: user.businessId, archivedAt: null, jobs: { some: { closedAt: null } } },
    select: { id: true, lat: true, lng: true, communityCode: true, formatted: true },
  });
  const groups = new Map<string, typeof props>();
  for (const p of props) groups.set(p.communityCode ?? "", [...(groups.get(p.communityCode ?? "") ?? []), p]);
  const codes = [...groups.keys()].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.localeCompare(b));
  let at = { lat: biz.depotLat ?? 50.913, lng: biz.depotLng ?? -114.117 };
  let n = 0;
  const updates: { id: string; routeSort: number }[] = [];
  for (const code of codes) {
    const list = groups.get(code)!;
    const pinned = list.filter((p): p is typeof p & { lat: number; lng: number } => p.lat != null && p.lng != null);
    const ordered = orderStops(at, pinned.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }) as Pt));
    const noPin = list.filter((p) => p.lat == null || p.lng == null).sort((a, b) => a.formatted.localeCompare(b.formatted));
    for (const p of [...ordered, ...noPin]) updates.push({ id: p.id, routeSort: (n += 10) });
    if (ordered.length) at = ordered.at(-1)!;
  }
  await db.$transaction(updates.map((u) => db.property.update({ where: { id: u.id }, data: { routeSort: u.routeSort } })));
  return updates.length;
}

/** Swap a stop with its neighbour on the standing route (within the same community). */
export async function moveStop(user: Actor, propertyId: string, dir: "up" | "down") {
  const p = await db.property.findFirstOrThrow({ where: { id: propertyId, businessId: user.businessId } });
  const siblings = await db.property.findMany({
    where: { businessId: user.businessId, communityCode: p.communityCode, archivedAt: null, jobs: { some: { closedAt: null } } },
    orderBy: [{ routeSort: { sort: "asc", nulls: "last" } }, { formatted: "asc" }],
  });
  // Give everyone a number first so swaps are well-defined.
  const base = Math.min(...siblings.map((s) => s.routeSort ?? Infinity).filter(Number.isFinite), 10_000);
  const numbered = siblings.map((s, i) => ({ id: s.id, routeSort: base + i * 10 }));
  const i = numbered.findIndex((s) => s.id === propertyId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= numbered.length) return;
  [numbered[i].routeSort, numbered[j].routeSort] = [numbered[j].routeSort, numbered[i].routeSort];
  await db.$transaction(numbered.map((u) => db.property.update({ where: { id: u.id }, data: { routeSort: u.routeSort } })));
}
