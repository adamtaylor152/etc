// Team view: who's doing what (day lanes or a week grid) and a map of the day's stops coloured by person.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RouteMap } from "@/components/route-map";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { TeamBoard, type BoardCard, type Lane } from "@/components/team-board";
import { btn, Card, Empty } from "@/components/ui";
import { conflicts, fmtMin, onTimeOff, unavailable } from "@/server/availability";
import { addDays, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { loadAvailability } from "@/server/schedule-data";

export const metadata = { title: "Team schedule" };

export default async function TeamSchedule({ searchParams }: PageProps<"/schedule/team">) {
  await requireOwner();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const week = sp.span === "week";
  const start = week ? addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7)) : date;
  const dates = Array.from({ length: week ? 7 : 1 }, (_, i) => addDays(start, i));
  const bid = await businessId();
  const [av, biz] = await Promise.all([loadAvailability(bid, dates[0], dates.at(-1)!), db.business.findUniqueOrThrow({ where: { id: bid } })]);
  const visitState = new Map(av.visits.map((v) => [v.id, v]));
  const cards: BoardCard[] = av.busy.map((b) => {
    const v = visitState.get(b.id);
    return {
      key: b.id, kind: (v ? "visit" : "task") as BoardCard["kind"], id: b.id, title: b.label, sub: v ? v.property.formatted.split(",")[0] : "Task", time: b.start != null ? fmtMin(b.start) : "",
      userIds: b.userIds, date: b.date, done: v ? v.state === "COMPLETED" : false, warnings: v?.state === "COMPLETED" ? [] : conflicts(b, av.busy, av.people, av.timeOff),
      confirmed: !!v?.confirmedAt, href: v ? `/visits/${b.id}` : `/tasks/${b.id}`, movable: v ? v.state === "SCHEDULED" && !v.snowEventId : true,
    };
  }).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const lanes: Lane[] = [
    ...av.people.map((p) => ({ id: p.id, name: p.name, color: p.color, offByDate: Object.fromEntries(dates.map((d) => { const why = unavailable(p.hours, av.timeOff, p.id, d, null, null); return [d, why ? why.replace(/^their /, "") : null]; })) })),
    { id: null, name: "Unassigned", color: "#94a3b8", offByDate: Object.fromEntries(dates.map((d) => [d, onTimeOff(av.timeOff, null, d) ? "closed" : null])) },
  ];
  const personOf = new Map(av.people.map((p) => [p.id, p]));
  const stops = !week ? av.busy.filter((b) => b.lat != null && b.lng != null && visitState.has(b.id)).map((b, i) => ({
    id: b.id, n: i + 1, lat: b.lat!, lng: b.lng!, label: `${b.label}${b.userIds.length ? ` · ${b.userIds.map((u) => personOf.get(u)?.name).join(", ")}` : " · unassigned"}`,
    done: visitState.get(b.id)!.state === "COMPLETED", color: personOf.get(b.userIds[0])?.color,
  })) : [];
  const nav = (d: string, s = week ? "week" : "day") => `/schedule/team?date=${d}&span=${s}`;
  const seg = "inline-flex min-h-8 items-center rounded-md px-3 text-[13px] font-semibold";
  return (
    <>
      <ScheduleTabs active="/schedule/team" />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <Link href={nav(todayLocal())} className={btn("secondary", "min-h-9 px-3 text-[13px]")}>Today</Link>
          <div className="flex">
            <Link href={nav(addDays(date, week ? -7 : -1))} className={btn("secondary", "min-h-9 rounded-r-none px-2")} aria-label={week ? "Previous week" : "Previous day"}><ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden /></Link>
            <Link href={nav(addDays(date, week ? 7 : 1))} className={btn("secondary", "-ml-px min-h-9 rounded-l-none px-2")} aria-label={week ? "Next week" : "Next day"}><ChevronRight className="size-4" strokeWidth={1.75} aria-hidden /></Link>
          </div>
        </div>
        <h2 className="font-display text-[1.15rem] font-semibold tabular-nums">{week ? `Week of ${new Date(`${start}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "UTC" })}` : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</h2>
        <div className="ml-auto flex gap-1 rounded-lg bg-tint p-1" role="group" aria-label="Span">
          <Link href={nav(date, "day")} aria-current={!week ? "true" : undefined} className={`${seg} ${!week ? "bg-white text-navy shadow-sm" : "text-ink-soft hover:text-navy"}`}>Day</Link>
          <Link href={nav(date, "week")} aria-current={week ? "true" : undefined} className={`${seg} ${week ? "bg-white text-navy shadow-sm" : "text-ink-soft hover:text-navy"}`}>Week</Link>
        </div>
      </div>
      <div className={`grid items-start gap-5 ${!week ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <div className="min-w-0">
          <TeamBoard lanes={lanes} dates={dates} cards={cards} today={todayLocal()} />
          <p className="mt-2 text-xs text-ink-soft">Drag a card to another person to reassign it{week ? ", or to another day to move it" : "; switch to Week to move it to another day"}. Finished work and storm visits stay where they are.</p>
        </div>
        {!week && (
          <Card className="p-2! sm:p-2!">
            {stops.length ? <RouteMap stops={stops} areas={[]} depot={{ lat: biz.depotLat ?? 50.91, lng: biz.depotLng ?? -114.11 }} /> : <Empty>No mapped visits this day.</Empty>}
            <p className="px-2 pb-1 pt-2 text-xs text-ink-soft">Pins are coloured by person.</p>
          </Card>
        )}
      </div>
    </>
  );
}
