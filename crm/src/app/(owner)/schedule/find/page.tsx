// Find a time: pick a visit, get the best open slots (by person, working hours, time off, and closeness to their other stops).
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Flash } from "@/components/flash";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { Button, Card, Empty, Field, inputCls } from "@/components/ui";
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
  return (
    <>
      <ScheduleTabs active="/schedule/find" />
      <Flash error={sp.error} />
      <Card className="mb-5">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <Field label="Visit to book">
              <select name="visit" defaultValue={visit?.id ?? ""} className={inputCls}>
                <option value="">Choose a visit…</option>
                {candidates.map((v) => <option key={v.id} value={v.id}>{clientName(v.job.client)} · {v.job.title} · {v.scheduledDate ? `now ${dateOnly(v.scheduledDate)}` : "unscheduled"}</option>)}
              </select>
            </Field>
          </div>
          <div className="w-28"><Field label="Takes"><select name="duration" defaultValue={duration} className={inputCls}>{[30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}</select></Field></div>
          <div className="w-28"><Field label="Look ahead"><select name="days" defaultValue={days} className={inputCls}>{[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field></div>
          <Button>Find times</Button>
        </form>
      </Card>
      {visit ? (
        <section className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-display text-[0.95rem] font-semibold">Best times for {clientName(visit.job.client)} · {visit.property.formatted.split(",")[0]}</h2>
            <p className="mt-0.5 text-xs text-ink-soft">Ranked by who is free and how close their other stops are that day.</p>
          </div>
          {sugg.length ? (
            <ul className="divide-y divide-line-soft">
              {sugg.map((s) => {
                const p = name.get(s.userId);
                return (
                  <li key={`${s.userId}${s.date}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-tint/60 sm:px-5">
                    <span className="w-44 font-semibold tabular-nums"><time dateTime={s.date}>{new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</time> · {fmtMin(s.start)}</span>
                    <span className="flex w-32 items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full" style={{ background: p?.color }} aria-hidden /><span className="truncate">{p?.name}</span></span>
                    <span className="min-w-0 flex-1 basis-40 tabular-nums text-ink-soft">{s.near ? `${s.nearKm! < 1 ? "<1" : s.nearKm!.toFixed(1)} km from ${s.near}` : "Free day"}</span>
                    <form action={bookSlot} className="ml-auto">
                      <input type="hidden" name="visitId" value={visit.id} /><input type="hidden" name="userId" value={s.userId} /><input type="hidden" name="date" value={s.date} />
                      <input type="hidden" name="start" value={s.start} /><input type="hidden" name="duration" value={duration} />
                      <Button variant="secondary" className="min-h-9 px-3" aria-label={`Book ${p?.name ?? "this slot"}, ${s.date} at ${fmtMin(s.start)}`}>Book</Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : <div className="p-4 sm:p-5"><Empty action={<Link href="/settings/team#hours" className="text-sm font-semibold text-blue hover:text-blue-deep">Check working hours</Link>}>No open slots in that window. Try a longer look-ahead or a shorter visit.</Empty></div>}
        </section>
      ) : <Empty>{candidates.length ? "Choose a visit and you will get the best open times for it: who is free, and how close they already are." : "There are no upcoming or unscheduled visits to book."}</Empty>}
    </>
  );
}
