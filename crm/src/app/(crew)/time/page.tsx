// My time: clock in/out for the day and this person's own week. No costs and nobody else's hours, so crew can open it.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Route, Square } from "lucide-react";
import { RunningClock } from "@/components/field/running-clock";
import { Flash } from "@/components/flash";
import { Badge, Card, btn } from "@/components/ui";
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
  const big = btn("primary", "min-h-16! w-full text-lg!");
  const weekBtn = "inline-flex size-11 items-center justify-center rounded-lg border border-line bg-white text-ink-soft hover:bg-tint hover:text-navy";
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight">My time</h1>
        <Link href="/run" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue hover:text-blue-deep"><Route className="size-4" aria-hidden />My route</Link>
      </div>
      <Flash error={sp.error} />
      <Card className="mb-5">
        {running ? (
          <form action={clockOutAction}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={isGeneral(running) ? "green" : "blue"}>{isGeneral(running) ? "On the clock" : "Timing a visit"}</Badge>
              <span className="text-sm tabular-nums text-ink-soft">since {clockTime(running.startedAt)}</span>
            </div>
            <p className="mt-3 text-center font-display text-[3.25rem] font-semibold leading-none"><RunningClock since={running.startedAt.toISOString()} /></p>
            {!isGeneral(running) && <p className="mt-3 text-sm text-ink-soft">Your day clock is paused and picks up when the visit timer stops.</p>}
            <button className={`${big} mt-4`}><Square className="size-5" aria-hidden />Clock out</button>
          </form>
        ) : (
          <form action={clockInAction}>
            <Badge>Not on the clock</Badge>
            <p className="mt-3 text-center font-display text-[3.25rem] font-semibold leading-none tabular-nums text-ink-faint" aria-hidden>0:00:00</p>
            <button className={`${big} mt-4`}><Play className="size-5" aria-hidden />Clock in</button>
          </form>
        )}
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link href={`/time?week=${addDays(monday, -7)}`} className={weekBtn} aria-label="Previous week"><ChevronLeft className="size-5" aria-hidden /></Link>
          <h2 className="font-display text-[0.95rem] font-semibold tabular-nums">{prettyDate(monday)} – {prettyDate(days[6])}</h2>
          <Link href={`/time?week=${addDays(monday, 7)}`} className={weekBtn} aria-label="Next week"><ChevronRight className="size-5" aria-hidden /></Link>
        </div>
        <div className="mb-3 rounded-lg bg-tint px-4 py-3">
          <div className="text-xs font-medium text-ink-soft">This week</div>
          <div className="mt-1 font-display text-[1.7rem] font-semibold leading-none tabular-nums">{hm(totals.total)}</div>
          {(totals.job > 0 || approved > 0) && <div className="mt-1.5 text-xs tabular-nums text-ink-soft">{[totals.job > 0 && `${hm(totals.job)} on visits`, approved > 0 && `${hm(approved)} approved`].filter(Boolean).join(" · ")}</div>}
        </div>
        <ul className="divide-y divide-line-soft text-sm">
          {days.map((d) => {
            const list = week.filter((e) => local(e.startedAt) === d);
            return (
              <li key={d} className="py-3">
                <div className="flex justify-between gap-3 font-semibold">
                  <span>{prettyDate(d)}{d === today && <span className="ml-2 text-xs font-medium text-blue-deep">Today</span>}</span>
                  <span className="tabular-nums">{list.length ? hm(clockTotals(list, now).total) : <span className="font-normal text-ink-soft" aria-label="No time">—</span>}</span>
                </div>
                {list.map((e) => (
                  <div key={e.id} className="mt-1.5 flex items-center justify-between gap-3 text-ink-soft">
                    <span className="flex min-w-0 items-center gap-2"><span className="truncate">{e.jobId ? jobs.get(e.jobId) ?? "Visit" : e.note || "General"}</span>{e.approvedAt && <Badge tone="green">Approved</Badge>}</span>
                    <span className="shrink-0 tabular-nums">{e.endedAt ? hm(e.minutes ?? 0) : `${hm(clockTotals([e], now).total)} so far`}</span>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-soft">Something wrong? Tell the office: only they can change time, and approved time is locked.</p>
      </Card>
    </div>
  );
}
