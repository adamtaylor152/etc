// My time: clock in/out for the day and this person's own week. No costs and nobody else's hours, so crew can open it.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Square } from "lucide-react";
import { Flash } from "@/components/flash";
import { requireUser } from "@/server/auth";
import { addDays, localDayStart, mondayOf, prettyDate, todayLocal, TZ } from "@/server/dates";
import { db } from "@/server/db";
import { hm } from "@/server/ops/costing";
import { clockTotals, isGeneral } from "@/server/status/clock";
import { clockInAction, clockOutAction } from "./actions";

export const metadata = { title: "My time" };
const local = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const clockTime = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export default async function MyTime({ searchParams }: PageProps<"/time">) {
  const user = await requireUser("/time");
  const sp = await searchParams;
  const today = todayLocal();
  const monday = mondayOf(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const mine = { businessId: user.businessId, userId: user.id };
  const [week, running] = await Promise.all([
    db.timeEntry.findMany({ where: { ...mine, startedAt: { gte: localDayStart(monday), lt: localDayStart(addDays(monday, 7)) } }, orderBy: { startedAt: "asc" } }),
    db.timeEntry.findFirst({ where: { ...mine, endedAt: null } }),
  ]);
  const jobIds = [...new Set(week.map((e) => e.jobId).filter((x): x is string => !!x))];
  const jobs = new Map((jobIds.length ? await db.job.findMany({ where: { id: { in: jobIds }, businessId: user.businessId }, select: { id: true, kind: true, title: true, property: { select: { formatted: true } } } }) : [])
    .map((j) => [j.id, `${j.kind === "SNOW_PLAN" ? "Snow" : j.title} · ${j.property.formatted.split(",")[0]}`]));
  const now = new Date(); // request time, for the running entry
  const totals = clockTotals(week, now);
  const approved = clockTotals(week.filter((e) => e.approvedAt), now).total;
  const big = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-lg font-bold text-white";
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">My time</h1>
        <Link href="/run" className="text-sm font-semibold text-blue">My route</Link>
      </div>
      <Flash error={sp.error} />
      <section className="mb-4 rounded-2xl bg-white p-4 shadow-card">
        {running ? (
          <form action={clockOutAction}>
            <p className="mb-3 text-sm text-ink-soft">{isGeneral(running) ? `On the clock since ${clockTime(running.startedAt)}` : `Timing a visit since ${clockTime(running.startedAt)}: your day clock is paused and picks up when the visit timer stops`}</p>
            <button className={`${big} bg-red-600`}><Square className="size-5" />Clock out</button>
          </form>
        ) : (
          <form action={clockInAction}>
            <p className="mb-3 text-sm text-ink-soft">Not on the clock.</p>
            <button className={`${big} bg-emerald-600`}><Play className="size-5" />Clock in</button>
          </form>
        )}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
          <Link href={`/time?week=${addDays(monday, -7)}`} className="rounded-lg border border-line p-2" aria-label="Previous week"><ChevronLeft className="size-4" /></Link>
          <span>{prettyDate(monday)} – {prettyDate(days[6])}</span>
          <Link href={`/time?week=${addDays(monday, 7)}`} className="rounded-lg border border-line p-2" aria-label="Next week"><ChevronRight className="size-4" /></Link>
        </div>
        <p className="mb-2 text-2xl font-bold">{hm(totals.total)} <span className="text-sm font-normal text-ink-soft">this week{totals.job > 0 && ` (${hm(totals.job)} on visits)`}{approved > 0 && ` · ${hm(approved)} approved`}</span></p>
        <ul className="divide-y divide-line text-sm">
          {days.map((d) => {
            const list = week.filter((e) => local(e.startedAt) === d);
            return (
              <li key={d} className="py-2">
                <div className="flex justify-between font-semibold"><span className={d === today ? "text-blue" : ""}>{prettyDate(d)}</span><span>{list.length ? hm(clockTotals(list, now).total) : <span className="font-normal text-ink-soft">—</span>}</span></div>
                {list.map((e) => (
                  <div key={e.id} className="mt-1 flex justify-between gap-2 text-ink-soft">
                    <span className="min-w-0 truncate">{e.jobId ? jobs.get(e.jobId) ?? "Visit" : e.note || "General"}{e.approvedAt && <span className="ml-2 rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-800">approved</span>}</span>
                    <span className="shrink-0">{e.endedAt ? hm(e.minutes ?? 0) : `${hm(clockTotals([e], now).total)} so far`}</span>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">Something wrong? Tell the office: only they can change time, and approved time is locked.</p>
      </section>
    </div>
  );
}
