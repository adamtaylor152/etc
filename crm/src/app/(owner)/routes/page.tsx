// Route: map + sheet of today's (or a storm's) stops, grouped by community in service-area order.
// The order is the standing route (auto-ordered by distance, nudged with ↑/↓), reused every storm. Prints on letter paper.
import type { GeoJsonObject } from "geojson";
import Link from "next/link";
import { RouteMap } from "@/components/route-map";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { addDays, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { mapsLink, routeVisits } from "@/server/routing";
import { routeAutoOrder, routeMove, routeSplit } from "../route-actions";

export const metadata = { title: "Route" };

export default async function Routes({ searchParams }: PageProps<"/routes">) {
  const sp = await searchParams;
  const bid = await businessId();
  const biz = await business();
  const storm = sp.storm ? await db.snowEvent.findFirst({ where: { id: String(sp.storm), businessId: bid } }) : null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.date)) ? String(sp.date) : todayLocal();
  const showDone = sp.done === "1";
  const states = showDone ? undefined : { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] as ("SCHEDULED" | "EN_ROUTE" | "IN_PROGRESS")[] };
  const { visits, groups } = await routeVisits(bid, storm ? { snowEventId: storm.id, state: states } : { scheduledDate: toDbDate(day), state: states });
  const base = storm ? `/routes?storm=${storm.id}` : `/routes?date=${day}`;
  const here = `${base}${showDone ? "&done=1" : ""}`;
  const stopNo = new Map(visits.map((v, i) => [v.id, i + 1]));
  const codes = groups.map((g) => g.code).filter((c): c is string => !!c);
  const areas = codes.length ? await db.community.findMany({ where: { code: { in: codes } }, select: { code: true, name: true, geometry: true } }) : [];
  const stops = visits.filter((v) => v.property.lat != null && v.property.lng != null).map((v) => ({
    id: v.id, n: stopNo.get(v.id)!, lat: v.property.lat!, lng: v.property.lng!, label: v.property.formatted, done: v.state === "COMPLETED",
  }));
  // One tap opens Google Maps with the next stops in order (phones handle ~3 waypoints reliably).
  const team = await db.user.findMany({ where: { businessId: bid, active: true }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } });
  const next = visits.filter((v) => v.state !== "COMPLETED").slice(0, 4).map((v) => v.property.formatted);
  const multi = next.length > 1
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(next.at(-1)!)}&waypoints=${encodeURIComponent(next.slice(0, -1).join("|"))}`
    : null;
  return (
    <>
      <PageHeader
        title={storm ? `Route · ${storm.name}` : `Route · ${prettyDate(day)}`}
        sub={`${visits.length} stop${visits.length === 1 ? "" : "s"}${showDone ? "" : " left"}`}
        actions={<div className="no-print flex flex-wrap items-center gap-2">
          {!storm && <>
            <Link href={`/routes?date=${addDays(day, -1)}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">←</Link>
            <form><Input type="date" name="date" defaultValue={day} className="w-40" /></form>
            <Link href={`/routes?date=${addDays(day, 1)}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">→</Link>
          </>}
          <Link href={`${base}${showDone ? "" : "&done=1"}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">{showDone ? "Hide done" : "Show done"}</Link>
          <form action={routeAutoOrder}><input type="hidden" name="back" value={here} /><Button variant="secondary">Auto-order</Button></form>
          <a href="javascript:print()" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Print</a>
        </div>}
      />
      {visits.length > 1 && team.length > 1 && (
        <details className="no-print mb-4 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
          <summary className="cursor-pointer font-semibold">Split this route between people</summary>
          <form action={routeSplit} className="mt-2 flex flex-wrap items-center gap-3">
            <input type="hidden" name="back" value={here} />{storm ? <input type="hidden" name="storm" value={storm.id} /> : <input type="hidden" name="date" value={day} />}
            {team.map((u) => <label key={u.id} className="flex items-center gap-1.5"><input type="checkbox" name="userId" value={u.id} defaultChecked className="size-4" />{u.name || u.email.split("@")[0]}</label>)}
            <Button variant="secondary">Split</Button>
            <span className="text-xs text-ink-soft">Keeps each community together and evens out the stop counts. Replaces who&apos;s assigned to open stops.</span>
          </form>
        </details>
      )}
      {stops.length > 0 && (
        <div className="no-print mb-4">
          <RouteMap stops={stops} areas={areas.map((a) => ({ code: a.code, name: a.name, geometry: a.geometry as unknown as GeoJsonObject }))} depot={{ lat: biz.depotLat ?? 50.913, lng: biz.depotLng ?? -114.117 }} />
          {multi && <a href={multi} className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-blue font-semibold text-white">Navigate the next {next.length} stops</a>}
        </div>
      )}
      {groups.length ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.code ?? "none"} title={<>{g.name} <span className="font-sans text-sm font-normal text-ink-soft">({g.visits.length})</span></>}>
              <ol className="divide-y divide-line">
                {g.visits.map((v, idx) => {
                  const done = v.state === "COMPLETED";
                  return (
                    <li key={v.id} className={`flex items-start gap-3 py-3 ${done ? "opacity-50" : ""}`}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm font-bold text-white">{stopNo.get(v.id)}</span>
                      <Link href={`/visits/${v.id}`} className="min-w-0 flex-1">
                        <span className="block font-semibold">{v.property.formatted}</span>
                        <span className="block text-sm text-ink-soft">
                          {clientName(v.job.client)} · {v.job.kind === "SNOW_PLAN" ? "Every snowfall" : v.job.title}
                          {v.iceMeltApplied || v.job.iceMelt ? " · ice melt" : ""}{v.pushNumber && v.pushNumber > 1 ? ` · push ${v.pushNumber}` : ""}
                        </span>
                        {v.property.accessNotes && <span className="block text-sm text-amber-800">{v.property.accessNotes}</span>}
                      </Link>
                      <span className="no-print flex shrink-0 items-center gap-1">
                        <span className="flex flex-col">
                          {idx > 0 && <form action={routeMove}><input type="hidden" name="propertyId" value={v.propertyId} /><input type="hidden" name="dir" value="up" /><input type="hidden" name="back" value={here} /><button className="px-2 text-ink-soft" aria-label="Move up">↑</button></form>}
                          {idx < g.visits.length - 1 && <form action={routeMove}><input type="hidden" name="propertyId" value={v.propertyId} /><input type="hidden" name="dir" value="down" /><input type="hidden" name="back" value={here} /><button className="px-2 text-ink-soft" aria-label="Move down">↓</button></form>}
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <a href={mapsLink(v.property.formatted)} className="rounded-full border-2 border-line px-3 py-1.5 text-sm font-semibold">Go</a>
                          {v.state !== "SCHEDULED" && <Badge tone={done ? "green" : "navy"}>{done ? "Done" : v.state === "SKIPPED" ? "Skipped" : "On it"}</Badge>}
                        </span>
                      </span>
                      <span className="hidden size-6 shrink-0 rounded border-2 border-navy print:block" aria-hidden />
                    </li>
                  );
                })}
              </ol>
            </Card>
          ))}
        </div>
      ) : <Empty>{showDone ? "No stops." : "Nothing left on this route."}</Empty>}
    </>
  );
}
