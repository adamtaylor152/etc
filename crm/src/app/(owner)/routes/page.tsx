// Route: map + sheet of today's (or a storm's) stops, grouped by community in service-area order.
// The order is the standing route (auto-ordered by drive time, reused every storm) unless this day was reordered on
// its own. Drag or ↑/↓ to reorder, then choose "this day only" or "every time". Shows an ETA per stop and totals per
// person (road times when ROUTING_URL is set, straight-line estimates otherwise). Prints on letter paper.
import { requireOwner } from "@/server/auth";
import type { GeoJsonObject } from "geojson";
import Link from "next/link";
import { ReorderList } from "@/components/reorder-list";
import { RouteMap } from "@/components/route-map";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { addDays, fromLocalInput, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { depotOf, mapsLink, routeEtas, routeVisits } from "@/server/routing";
import { clock, duration } from "@/server/routing/eta";
import { sizeNote } from "@/server/runner";
import { routeAutoOrder, routeReorder, routeSplit } from "../route-actions";

export const metadata = { title: "Route" };

export default async function Routes({ searchParams }: PageProps<"/routes">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const biz = await business();
  const storm = sp.storm ? await db.snowEvent.findFirst({ where: { id: String(sp.storm), businessId: bid } }) : null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.date)) ? String(sp.date) : todayLocal();
  const showDone = sp.done === "1";
  const states = showDone ? undefined : { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] as ("SCHEDULED" | "EN_ROUTE" | "IN_PROGRESS")[] };
  const { visits, groups } = await routeVisits(bid, storm ? { snowEventId: storm.id, state: states } : { scheduledDate: toDbDate(day), state: states });
  // ETAs run from a set-off time: ?start=HH:MM, else now for today or a storm, else 8am.
  const setOff = /^\d{2}:\d{2}$/.test(String(sp.start)) ? String(sp.start) : null;
  const startAt = (!storm && fromLocalInput(`${day}T${setOff ?? "08:00"}`)) || new Date();
  const from = setOff || storm || day !== todayLocal() ? startAt : new Date();
  const base = `${storm ? `/routes?storm=${storm.id}` : `/routes?date=${day}`}${setOff && !storm ? `&start=${setOff}` : ""}`;
  const here = `${base}${showDone ? "&done=1" : ""}`;
  const times = await routeEtas(bid, visits.filter((v) => v.state === "SCHEDULED" || v.state === "EN_ROUTE" || v.state === "IN_PROGRESS"), from);
  const stopNo = new Map(visits.map((v, i) => [v.id, i + 1]));
  const codes = groups.map((g) => g.code).filter((c): c is string => !!c);
  const areas = codes.length ? await db.community.findMany({ where: { code: { in: codes } }, select: { code: true, name: true, geometry: true } }) : [];
  const stops = visits.filter((v) => v.property.lat != null && v.property.lng != null).map((v) => ({
    id: v.id, n: stopNo.get(v.id)!, lat: v.property.lat!, lng: v.property.lng!, label: v.property.formatted, done: v.state === "COMPLETED",
  }));
  // One tap opens Google Maps with the next stops in order (phones handle ~3 waypoints reliably).
  const team = await db.user.findMany({ where: { businessId: bid, active: true }, select: { id: true, name: true, email: true, startLat: true, startLng: true }, orderBy: { createdAt: "asc" } });
  const starters = team.filter((u) => u.startLat != null && u.startLng != null);
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
            <form className="flex items-center gap-1"><Input type="date" name="date" defaultValue={day} aria-label="Day" className="w-40" /><Input type="time" name="start" defaultValue={setOff ?? ""} aria-label="Set off at" title="Set off at (for the ETAs)" className="w-28" /><Button variant="secondary">Go</Button></form>
            <Link href={`/routes?date=${addDays(day, 1)}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">→</Link>
          </>}
          <Link href={`${base}${showDone ? "" : "&done=1"}`} className="rounded-full bg-white px-3 py-2 text-sm font-semibold">{showDone ? "Hide done" : "Show done"}</Link>
          <form action={routeAutoOrder}><input type="hidden" name="back" value={here} />
            {starters.length > 0 && <select name="from" aria-label="Auto-order starting from" className="h-10 rounded-lg border border-line bg-white px-2 text-sm"><option value="">From the depot</option>{starters.map((u) => <option key={u.id} value={u.id}>From {u.name || u.email.split("@")[0]}&apos;s start</option>)}</select>}
            <Button variant="secondary" title="Re-plans the standing route for every day, and clears any day-only orders">Auto-order</Button></form>
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
            <span className="text-xs text-ink-soft">Keeps each community together and evens out the estimated time (driving plus {times.serviceMin} min a stop). Replaces who&apos;s assigned to open stops.</span>
          </form>
        </details>
      )}
      {stops.length > 0 && (
        <div className="no-print mb-4">
          <RouteMap stops={stops} areas={areas.map((a) => ({ code: a.code, name: a.name, geometry: a.geometry as unknown as GeoJsonObject }))} depot={depotOf(biz)} lines={times.people.map((p) => ({ color: p.color, pts: p.path.map((q) => [q.lat, q.lng] as [number, number]) }))} />
          {multi && <a href={multi} className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-blue font-semibold text-white">Navigate the next {next.length} stops</a>}
        </div>
      )}
      {times.people.length > 0 && (
        <div className="mb-4 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
          {times.people.map((p) => (
            <p key={p.id}><span className="font-semibold" style={{ color: p.color }}>{p.name}</span>: {p.stops} stop{p.stops === 1 ? "" : "s"} · {duration(p.driveMin)} driving · about {duration(p.totalMin)} in all · back around {clock(p.finish)}</p>
          ))}
          <p className="mt-1 text-xs text-ink-soft">Setting off {clock(from)}, {times.serviceMin} min a stop, including the drive back. {times.road ? "Road drive times." : "Straight-line estimates at 30 km/h (no road routing)."} Times are estimates.</p>
        </div>
      )}
      {groups.length ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.code ?? "none"} title={<>{g.name} <span className="font-sans text-sm font-normal text-ink-soft">({g.visits.length})</span></>}>
              <ReorderList action={routeReorder} hidden={{ back: here }} saves={[{ label: storm ? "This storm only" : "This day only", scope: "day" }, { label: "Every time", scope: "always" }]}
                items={g.visits.map((v) => {
                  const done = v.state === "COMPLETED";
                  const eta = times.stops.get(v.id);
                  return { id: v.id, node: (
                    <div className={`flex items-start gap-3 py-3 ${done ? "opacity-50" : ""}`}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm font-bold text-white">{stopNo.get(v.id)}</span>
                      <Link href={`/visits/${v.id}`} className="min-w-0 flex-1">
                        <span className="block font-semibold">{v.property.formatted}{v.property.routePriority && <span className="ml-2 rounded-full bg-blue/10 px-2 py-0.5 text-xs font-semibold text-blue">do first</span>}{sizeNote(v.job.kind === "SNOW_PLAN" || !!v.snowEventId, v.property) && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">size not checked</span>}</span>
                        <span className="block text-sm text-ink-soft">
                          {clientName(v.job.client)} · {v.job.kind === "SNOW_PLAN" ? "Every snowfall" : v.job.title}
                          {v.iceMeltApplied || v.job.iceMelt ? " · ice melt" : ""}{v.pushNumber && v.pushNumber > 1 ? ` · push ${v.pushNumber}` : ""}
                        </span>
                        {v.property.accessNotes && <span className="block text-sm text-amber-800">{v.property.accessNotes}</span>}
                      </Link>
                      {eta && <span className="shrink-0 pt-1 text-sm font-semibold tabular-nums" title={`${duration(eta.driveMin)} drive`}>~{clock(eta.eta)}</span>}
                      <span className="no-print flex shrink-0 flex-col items-end gap-1">
                        <a href={mapsLink(v.property.formatted)} className="rounded-full border-2 border-line px-3 py-1.5 text-sm font-semibold">Go</a>
                        {v.state !== "SCHEDULED" && <Badge tone={done ? "green" : "navy"}>{done ? "Done" : v.state === "SKIPPED" ? "Skipped" : "On it"}</Badge>}
                      </span>
                      <span className="hidden size-6 shrink-0 rounded border-2 border-navy print:block" aria-hidden />
                    </div>
                  ) };
                })} />
            </Card>
          ))}
        </div>
      ) : <Empty>{showDone ? "No stops." : "Nothing left on this route."}</Empty>}
    </>
  );
}
