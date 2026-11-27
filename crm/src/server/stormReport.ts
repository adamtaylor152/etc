// Proof-of-service for one storm: every visit with times, GPS, depth, ice melt, skip reasons and photos.
import { TZ } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { routeVisits } from "./routing";

const time = (d: Date | null) => (d ? d.toLocaleString("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "");

export async function stormReport(businessId: string, snowEventId: string) {
  const ev = await db.snowEvent.findFirstOrThrow({ where: { id: snowEventId, businessId }, include: { season: true } });
  const { visits } = await routeVisits(businessId, { snowEventId });
  const photos = await db.attachment.findMany({ where: { visitId: { in: visits.map((v) => v.id) }, deletedAt: null }, orderBy: { createdAt: "asc" } });
  const rows = visits.map((v) => ({
    id: v.id, address: v.property.formatted, community: v.property.community?.name ?? "", client: clientName(v.job.client),
    push: v.pushNumber ?? 1, state: v.state, enRoute: time(v.enRouteAt), arrived: time(v.arrivedAt), completed: time(v.completedAt),
    skipped: time(v.skippedAt), skipReason: v.skipReason ?? "", skipNote: v.skipNote ?? "", depthCm: v.depthCm, iceMelt: v.state === "COMPLETED" && v.iceMeltApplied ? "yes" : "",
    gps: v.completedLat != null ? `${v.completedLat.toFixed(5)},${v.completedLng!.toFixed(5)}` : "",
    photos: photos.filter((p) => p.visitId === v.id),
  }));
  return { ev, rows };
}
