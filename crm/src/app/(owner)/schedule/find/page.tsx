// Find a time: pick a visit, get the best open slots (by person, working hours, time off, and closeness to their other stops).
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { fmtMin, localParts, suggestSlots } from "@/server/availability";
import { addDays, dateOnly, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { loadAvailability } from "@/server/schedule-data";
import { bookSlot } from "../../schedule-actions";

export const metadata = { title: "Find a time" };

export default async function FindTime({ searchParams }: PageProps<"/schedule/find">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const today = todayLocal();
  const duration = Math.min(480, Math.max(15, Number(sp.duration) || 60));
  const days = Math.min(30, Math.max(1, Number(sp.days) || 14));
  const candidates = await db.visit.findMany({
    where: { businessId: bid, state: "SCHEDULED", snowEventId: null, job: { closedAt: null }, OR: [{ scheduledDate: null }, { scheduledDate: { gte: new Date(`${today}T00:00:00Z`) } }] },
    include: { job: { include: { client: true } }, property: true }, orderBy: [{ scheduledDate: { sort: "asc", nulls: "first" } }], take: 100,
  });
  const visit = typeof sp.visit === "string" ? candidates.find((v) => v.id === sp.visit) ?? null : null;
  const av = visit ? await loadAvailability(bid, today, addDays(today, days)) : null;
  const sugg = visit && av ? suggestSlots({
    people: av.people, timeOff: av.timeOff, busy: av.busy.filter((b) => b.id !== visit.id), from: today, days, durationMin: duration, addDays, nowMin: localParts(new Date()).min,
    where: visit.property.lat != null && visit.property.lng != null ? { lat: visit.property.lat, lng: visit.property.lng } : null,
  }) : [];
  const name = new Map(av?.people.map((p) => [p.id, p]) ?? []);
  const sel = "min-h-10 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <>
      <ScheduleTabs active="/schedule/find" />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
        <label className="min-w-64 flex-1">Visit to book
          <select name="visit" defaultValue={visit?.id ?? ""} className={`${sel} mt-1 w-full`}>
            <option value="">Choose a visit…</option>
            {candidates.map((v) => <option key={v.id} value={v.id}>{clientName(v.job.client)} · {v.job.title} · {v.scheduledDate ? `now ${dateOnly(v.scheduledDate)}` : "unscheduled"}</option>)}
          </select>
        </label>
        <label>Takes<select name="duration" defaultValue={duration} className={`${sel} mt-1 block`}>{[30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}</select></label>
        <label>Look ahead<select name="days" defaultValue={days} className={`${sel} mt-1 block`}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
        <button className="min-h-10 rounded-lg bg-blue px-4 font-semibold text-white">Find times</button>
      </form>
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}
      {visit && (
        <section className="rounded-lg border border-line bg-white shadow-card">
          <h2 className="border-b border-line p-3 text-sm font-bold">Best times for {clientName(visit.job.client)} · {visit.property.formatted.split(",")[0]}</h2>
          <ul className="divide-y divide-line">
            {sugg.map((s) => {
              const p = name.get(s.userId);
              return (
                <li key={`${s.userId}${s.date}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="w-40 font-semibold">{new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} · {fmtMin(s.start)}</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: p?.color }} />{p?.name}</span>
                  <span className="flex-1 text-ink-soft">{s.near ? `${s.nearKm! < 1 ? "<1" : s.nearKm!.toFixed(1)} km from ${s.near}` : "free day"}</span>
                  <form action={bookSlot}>
                    <input type="hidden" name="visitId" value={visit.id} /><input type="hidden" name="userId" value={s.userId} /><input type="hidden" name="date" value={s.date} />
                    <input type="hidden" name="start" value={s.start} /><input type="hidden" name="duration" value={duration} />
                    <button className="min-h-9 rounded-lg bg-navy px-3 font-semibold text-white">Book</button>
                  </form>
                </li>
              );
            })}
            {!sugg.length && <li className="p-6 text-center text-sm text-ink-soft">No open slots in that window. Check working hours in <Link href="/settings/team#hours" className="text-blue">Team settings</Link>.</li>}
          </ul>
        </section>
      )}
    </>
  );
}
