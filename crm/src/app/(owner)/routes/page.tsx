// Route: map + sheet of today's (or a storm's) stops, grouped by community in service-area order.
// The order is the standing route (auto-ordered by drive time, reused every storm) unless this day was reordered on
// its own. Drag or ↑/↓ to reorder, then choose "this day only" or "every time". Shows an ETA per stop and totals per
// person (road times when ROUTING_URL is set, straight-line estimates otherwise). Prints on letter paper.
import { requireOwner } from "@/server/auth";
import type { GeoJsonObject } from "geojson";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Navigation, Printer, TriangleAlert } from "lucide-react";
import { DatePick } from "@/components/auto-submit";
import { RouteReorder } from "@/components/field/route-reorder";
import { RouteMap } from "@/components/route-map";
import { Badge, Button, ButtonLink, Card, Empty, Field, Input, PageHeader, btn, inputCls } from "@/components/ui";
import { addDays, fromLocalInput, prettyDate, prettyTime, todayLocal, toDbDate } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { depotOf, mapsLink, routeEtas, routeVisits } from "@/server/routing";
import { duration } from "@/server/routing/eta";
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
  const dayBtn = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-soft shadow-sm hover:bg-tint hover:text-navy sm:size-10";
  const who = (u: { name: string | null; email: string }) => u.name || u.email.split("@")[0];
  return (
    <>
      <PageHeader
        title={storm ? `Route · ${storm.name}` : `Route · ${prettyDate(day)}`}
        sub={<span className="tabular-nums">{visits.length} stop{visits.length === 1 ? "" : "s"}{showDone ? "" : " left"}</span>}
        actions={<div className="no-print flex flex-wrap items-center gap-2">
          {!storm && (
            // One control: step a day either way, or pick one (the page reloads on the day picked).
            // The picker's own "Day" label is pulled to the front of the group, so it reads: Day, back, date, forward.
            <div className="flex items-center gap-1 [&_label]:contents [&_label>span]:order-first [&_label>span]:mr-1" role="group" aria-label="Day">
              <Link href={`/routes?date=${addDays(day, -1)}`} className={dayBtn} aria-label="Previous day"><ChevronLeft className="size-4" aria-hidden /></Link>
              <DatePick key={day} date={day} />
              <Link href={`/routes?date=${addDays(day, 1)}`} className={dayBtn} aria-label="Next day"><ChevronRight className="size-4" aria-hidden /></Link>
            </div>
          )}
          <ButtonLink href={`${base}${showDone ? "" : "&done=1"}`}>{showDone ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}{showDone ? "Hide done" : "Show done"}</ButtonLink>
          <a href="javascript:print()" className={btn("secondary")}><Printer className="size-4" aria-hidden />Print</a>
        </div>}
      />
      <div className="grid items-start gap-5 lg:grid-cols-2 print:block">
        <div className="space-y-5 lg:sticky lg:top-20">
            {stops.length > 0 && (
              <div className="no-print">
                <RouteMap stops={stops} areas={areas.map((a) => ({ code: a.code, name: a.name, geometry: a.geometry as unknown as GeoJsonObject }))} depot={depotOf(biz)} lines={times.people.map((p) => ({ color: p.color, pts: p.path.map((q) => [q.lat, q.lng] as [number, number]) }))} />
                {multi && <a href={multi} className={btn("primary", "mt-3 min-h-12! w-full")}><Navigation className="size-4" aria-hidden />Navigate the next {next.length} stops</a>}
              </div>
            )}
            <Card title="Plan this route" className="no-print">
                {!storm && (
                  <form className="mb-4 border-b border-line-soft pb-4">
                    <input type="hidden" name="date" value={day} />{showDone && <input type="hidden" name="done" value="1" />}
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1"><Field label="Set off at"><Input key={`${day}-${setOff}`} type="time" name="start" defaultValue={setOff ?? (day === todayLocal() ? "" : "08:00")} /></Field></div>
                      <Button variant="secondary">Update times</Button>
                    </div>
                    <p className="mt-1.5 text-xs text-ink-soft">Arrival times are worked out from this. Left blank, today&apos;s route runs from now and other days from 8:00 a.m.</p>
                  </form>
                )}
                <form action={routeAutoOrder}>
                  <input type="hidden" name="back" value={here} />
                  <div className="flex flex-wrap items-center gap-2">
                    {starters.length > 0 && <select name="from" aria-label="Auto-order starting from" className={`${inputCls} w-auto min-w-44 flex-1`}><option value="">From the depot</option>{starters.map((u) => <option key={u.id} value={u.id}>From {who(u)}&apos;s start</option>)}</select>}
                    <Button variant="secondary">Auto-order</Button>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft">Re-plans the standing route for every day by drive time, and clears any day-only orders.</p>
                </form>
                {visits.length > 1 && team.length > 1 && (
                  <details className="mt-4 border-t border-line-soft pt-4">
                    <summary className="flex min-h-8 items-center text-sm font-semibold max-sm:min-h-11">Split this route between people</summary>
                    <form action={routeSplit} className="mt-2">
                      <input type="hidden" name="back" value={here} />{storm ? <input type="hidden" name="storm" value={storm.id} /> : <input type="hidden" name="date" value={day} />}
                      <div className="flex flex-wrap items-center gap-x-4">
                        {team.map((u) => <label key={u.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="userId" value={u.id} defaultChecked className="size-5" />{who(u)}</label>)}
                      </div>
                      <Button variant="secondary" className="mt-1">Split route</Button>
                      <p className="mt-2 text-xs text-ink-soft">Keeps each community together and evens out the estimated time (driving plus {times.serviceMin} min a stop). Replaces who&apos;s assigned to open stops.</p>
                    </form>
                  </details>
                )}
            </Card>
        </div>
        <div className="space-y-5">
          {times.people.length > 0 && (
            <Card title="Time on the road" className="print:mb-4">
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-medium text-ink-soft"><th scope="col" className="pb-2 text-left font-medium">Person</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Stops</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Driving</th><th scope="col" className="pb-2 pl-3 text-right font-medium">In all</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Back around</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft border-t border-line-soft">
                    {times.people.map((p) => (
                      <tr key={p.id}>
                        <th scope="row" className="py-2.5 text-left font-semibold"><span className="inline-flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</span></th>
                        <td className="py-2.5 pl-3 text-right">{p.stops}</td>
                        <td className="whitespace-nowrap py-2.5 pl-3 text-right">{duration(p.driveMin)}</td>
                        <td className="whitespace-nowrap py-2.5 pl-3 text-right font-semibold">{duration(p.totalMin)}</td>
                        <td className="whitespace-nowrap py-2.5 pl-3 text-right">{prettyTime(p.finish)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">Setting off {prettyTime(from)}, {times.serviceMin} min a stop (or what a property usually takes, once it has 3 timed visits), including the drive back. {times.road ? "Road drive times." : "Straight-line estimates at 30 km/h (no road routing)."} Times are estimates.</p>
            </Card>
          )}
        {groups.length ? (
          <div className="space-y-5">
            {groups.map((g) => (
              <Card key={g.code ?? "none"} title={g.name} actions={<span className="text-xs font-medium tabular-nums text-ink-soft">{g.visits.length} stop{g.visits.length === 1 ? "" : "s"}</span>} className="print:break-inside-avoid">
                <div className="-my-1">
                  <RouteReorder action={routeReorder} hidden={{ back: here }} start={stopNo.get(g.visits[0]?.id) ?? 1}
                    saves={[
                      { label: storm ? "This storm only" : "This day only", scope: "day", hint: storm ? "Only this storm's visits move. The standing route stays as it is." : `Only ${prettyDate(day)} changes. The standing route stays as it is.`, primary: true },
                      { label: "Every time", scope: "always", hint: "Becomes the standing route, used for every day and storm from now on." },
                    ]}
                    items={g.visits.map((v) => {
                      const done = v.state === "COMPLETED";
                      const eta = times.stops.get(v.id);
                      const unchecked = sizeNote(v.job.kind === "SNOW_PLAN" || !!v.snowEventId, v.property);
                      return { id: v.id, node: (
                        <div className={`flex items-start gap-3 py-3 ${done ? "opacity-60" : ""}`}>
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold tabular-nums text-white"><span className="sr-only">Stop </span><span className="reorder-n" /></span>
                          <Link href={`/visits/${v.id}`} className="group min-w-0 flex-1 rounded-md">
                            <span className="block font-semibold group-hover:text-blue-deep">{v.property.formatted}</span>
                            {(v.property.routePriority || unchecked) && (
                              <span className="mt-1 flex flex-wrap gap-1.5">{v.property.routePriority && <Badge tone="blue">Do first</Badge>}{unchecked && <Badge tone="amber">Size not checked</Badge>}</span>
                            )}
                            <span className="mt-0.5 block text-sm text-ink-soft">
                              {clientName(v.job.client)} · {v.isReturn ? <span className="font-semibold text-navy">Return visit</span> : v.job.kind === "SNOW_PLAN" ? "Every snowfall" : v.job.title}
                              {v.iceMeltApplied || v.job.iceMelt ? " · ice melt" : ""}{v.pushNumber && v.pushNumber > 1 ? ` · push ${v.pushNumber}` : ""}
                              {times.usual.has(v.id) && ` · usually ${times.usual.get(v.id)} min`}
                            </span>
                            {v.property.accessNotes && <span className="mt-1 flex gap-1.5 text-sm font-medium text-amber-900"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{v.property.accessNotes}</span>}
                          </Link>
                          <span className="flex shrink-0 flex-col items-end gap-1.5">
                            {eta && <span className="whitespace-nowrap pt-0.5 text-sm font-semibold tabular-nums" title={`${duration(eta.driveMin)} drive`}><span className="sr-only">Arriving about </span><span aria-hidden>~</span>{prettyTime(eta.eta)}</span>}
                            {v.state !== "SCHEDULED" && <Badge tone={done ? "green" : v.state === "SKIPPED" ? "gray" : "blue"}>{done ? "Done" : v.state === "SKIPPED" ? "Skipped" : "On it"}</Badge>}
                            <a href={mapsLink(v.property.formatted)} aria-label={`Navigate to ${v.property.formatted}`} className={btn("secondary", "no-print sm:min-h-9! px-3!")}><Navigation className="size-3.5" aria-hidden />Go</a>
                          </span>
                          <span className="hidden size-6 shrink-0 rounded border-2 border-navy print:block" aria-hidden />
                        </div>
                      ) };
                    })} />
                </div>
              </Card>
            ))}
          </div>
        ) : <Empty action={!showDone && <ButtonLink href={`${base}&done=1`}>Show done stops</ButtonLink>}>{showDone ? `No stops on this route${storm ? "" : ` for ${prettyDate(day)}`}.` : "Nothing left on this route."}</Empty>}
        </div>
      </div>
    </>
  );
}
