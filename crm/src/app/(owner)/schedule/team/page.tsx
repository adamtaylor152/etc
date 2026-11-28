// Team view: who's doing what (day lanes or a week grid) and a map of the day's stops coloured by person.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RouteMap } from "@/components/route-map";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { TeamBoard, type BoardCard, type Lane } from "@/components/team-board";
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
  return (
    <>
      <ScheduleTabs active="/schedule/team" />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href={nav(addDays(date, week ? -7 : -1))} className="rounded-lg border border-line bg-white p-2" aria-label="Previous"><ChevronLeft className="size-4" /></Link>
        <Link href={nav(todayLocal())} className="rounded-lg border border-line bg-white px-3 py-1.5 font-semibold">Today</Link>
        <Link href={nav(addDays(date, week ? 7 : 1))} className="rounded-lg border border-line bg-white p-2" aria-label="Next"><ChevronRight className="size-4" /></Link>
        <span className="font-semibold">{week ? `Week of ${new Date(`${start}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "UTC" })}` : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</span>
        <span className="ml-auto flex gap-1 rounded-lg bg-white p-1 shadow-card">
          <Link href={nav(date, "day")} className={`rounded-md px-3 py-1 font-semibold ${!week ? "bg-navy text-white" : "text-ink-soft"}`}>Day</Link>
          <Link href={nav(date, "week")} className={`rounded-md px-3 py-1 font-semibold ${week ? "bg-navy text-white" : "text-ink-soft"}`}>Week</Link>
        </span>
      </div>
      <div className={`grid gap-4 ${!week ? "xl:grid-cols-[1fr_26rem]" : ""}`}>
        <TeamBoard lanes={lanes} dates={dates} cards={cards} />
        {!week && (
          <section className="rounded-lg border border-line bg-white p-2 shadow-card">
            {stops.length ? <RouteMap stops={stops} areas={[]} depot={{ lat: biz.depotLat ?? 50.91, lng: biz.depotLng ?? -114.11 }} /> : <p className="p-6 text-center text-sm text-ink-soft">No mapped visits this day.</p>}
            <p className="px-2 pb-1 pt-2 text-xs text-ink-soft">Pins are coloured by person. Drag cards between people to reassign; between days on the week view to move.</p>
          </section>
        )}
      </div>
    </>
  );
}
