// Route sheet: today's (or a storm's) stops, grouped by community in service-area order. Prints on letter paper.
import Link from "next/link";
import { Badge, Card, Empty, Input, PageHeader } from "@/components/ui";
import { addDays, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { mapsLink, routeVisits } from "@/server/routing";

export const metadata = { title: "Route" };

export default async function Routes({ searchParams }: PageProps<"/routes">) {
  const sp = await searchParams;
  const bid = await businessId();
  const storm = sp.storm ? await db.snowEvent.findFirst({ where: { id: String(sp.storm), businessId: bid } }) : null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.date)) ? String(sp.date) : todayLocal();
  const showDone = sp.done === "1";
  const states = showDone ? undefined : { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] as ("SCHEDULED" | "EN_ROUTE" | "IN_PROGRESS")[] };
  const { visits, groups } = await routeVisits(bid, storm ? { snowEventId: storm.id, state: states } : { scheduledDate: toDbDate(day), state: states });
  const base = storm ? `/routes?storm=${storm.id}` : `/routes?date=${day}`;
  const stopNo = new Map(visits.map((v, i) => [v.id, i + 1]));
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
          <a href="javascript:print()" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Print</a>
        </div>}
      />
      {groups.length ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.code ?? "none"} title={<>{g.name} <span className="font-sans text-sm font-normal text-ink-soft">({g.visits.length})</span></>}>
              <ol className="divide-y divide-line">
                {g.visits.map((v) => {
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
                      <span className="no-print flex shrink-0 flex-col items-end gap-1">
                        <a href={mapsLink(v.property.formatted)} className="rounded-full border-2 border-line px-3 py-1.5 text-sm font-semibold">Go</a>
                        {v.state !== "SCHEDULED" && <Badge tone={done ? "green" : "navy"}>{done ? "Done" : v.state === "SKIPPED" ? "Skipped" : "On it"}</Badge>}
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
