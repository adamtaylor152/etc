// Time sheets: one week at a time, a row per person, minutes per day, and every entry (editable until approved).
// Approving locks a person's week (or everyone's time up to a date) until an owner un-approves it.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Trash2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { timeAdd, timeApprove, timeDelete, timeStop, timeUnapprove, timeUpdate } from "../costing-actions";
import { addDays, mondayOf, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { hm } from "@/server/ops/costing";
import { personName, team } from "@/server/schedule";

export const metadata = { title: "Time sheets" };
const local = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

export default async function Timesheets({ searchParams }: PageProps<"/timesheets">) {
  await requireOwner();
  const sp = await searchParams;
  const today = todayLocal();
  const monday = mondayOf(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const bid = await businessId();
  const [entries, people] = await Promise.all([
    db.timeEntry.findMany({ where: { businessId: bid, startedAt: { gte: new Date(`${addDays(monday, -1)}T00:00:00Z`), lt: new Date(`${addDays(monday, 8)}T00:00:00Z`) } }, include: { user: true }, orderBy: { startedAt: "asc" } }),
    team(bid),
  ]);
  const inWeek = entries.filter((e) => days.includes(local(e.startedAt)));
  const jobIds = [...new Set(inWeek.map((e) => e.jobId).filter((x): x is string => !!x))];
  const jobs = new Map((jobIds.length ? await db.job.findMany({ where: { id: { in: jobIds } }, include: { client: true } }) : []).map((j) => [j.id, `#${j.number} ${j.client.firstName} ${j.client.lastName}`.trim()]));
  const now = new Date(); // request time, for running timers
  const mins = (e: (typeof inWeek)[number]) => e.minutes ?? Math.round((now.getTime() - e.startedAt.getTime()) / 60_000);
  const inp = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  const back = `/timesheets?week=${monday}`, csv = `/api/export/report/timesheets?from=${monday}&to=${days[6]}`;
  const btn = "min-h-9 rounded-lg border border-line bg-white px-2 text-xs font-semibold";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Time sheets</h1>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link href={`/timesheets?week=${addDays(monday, -7)}`} className="rounded-lg border border-line bg-white p-2" aria-label="Previous week"><ChevronLeft className="size-4" /></Link>
          <span>{new Date(`${monday}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – {new Date(`${days[6]}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
          <Link href={`/timesheets?week=${addDays(monday, 7)}`} className="rounded-lg border border-line bg-white p-2" aria-label="Next week"><ChevronRight className="size-4" /></Link>
          <Link href="/timesheets" className="rounded-lg border border-line bg-white px-3 py-1.5">This week</Link>
          <a href={csv} className="rounded-lg border border-line bg-white px-3 py-1.5">Download CSV</a>
          <Link href="/time" className="rounded-lg border border-line bg-white px-3 py-1.5">My clock</Link>
        </div>
      </div>
      <Flash error={sp.error} />
      <section className="mb-5 overflow-x-auto rounded-lg border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-soft"><th className="px-4 py-2.5">Person</th>{days.map((d) => <th key={d} className={`px-2 text-center ${d === today ? "text-blue" : ""}`}>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", day: "numeric", timeZone: "UTC" })}</th>)}<th className="px-4 text-right">Total</th><th className="px-2 text-right">Approved</th><th className="px-2 text-right">Not yet</th><th className="px-4" /></tr></thead>
          <tbody>
            {people.map((p) => {
              const mine = inWeek.filter((e) => e.userId === p.id);
              const ok = mine.filter((e) => e.approvedAt).reduce((n, e) => n + mins(e), 0), open = mine.reduce((n, e) => n + mins(e), 0) - ok;
              const hid = <><input type="hidden" name="userId" value={p.id} /><input type="hidden" name="from" value={monday} /><input type="hidden" name="to" value={days[6]} /><input type="hidden" name="back" value={back} /></>;
              return (
                <tr key={p.id} className="border-b border-line/60">
                  <td className="px-4 py-2.5 font-semibold"><span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: p.color }} />{p.name}</td>
                  {days.map((d) => { const m = mine.filter((e) => local(e.startedAt) === d).reduce((n, e) => n + mins(e), 0); return <td key={d} className="px-2 text-center">{m ? hm(m) : <span className="text-ink-soft">—</span>}</td>; })}
                  <td className="px-4 text-right font-bold">{hm(ok + open)}</td>
                  <td className="px-2 text-right text-emerald-800">{ok ? hm(ok) : "—"}</td>
                  <td className="px-2 text-right">{open ? hm(open) : "—"}</td>
                  <td className="px-4 py-1.5">
                    <span className="flex justify-end gap-1.5 whitespace-nowrap">
                      {mine.some((e) => e.endedAt && !e.approvedAt) && <form action={timeApprove}>{hid}<button className={`${btn} border-emerald-600 text-emerald-800`}>Approve week</button></form>}
                      {ok > 0 && <form action={timeUnapprove}>{hid}<button className={btn}>Un-approve</button></form>}
                      {mine.length > 0 && <a href={`${csv}&person=${p.id}`} className={`${btn} inline-flex items-center`}>CSV</a>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-line bg-white p-4 shadow-card">
        <h2 className="mb-2 text-base font-bold">Entries</h2>
        <ul className="divide-y divide-line text-sm">
          {inWeek.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="w-28 font-semibold">{personName(e.user)}</span>
              <span className="w-24 text-ink-soft">{new Date(`${local(e.startedAt)}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</span>
              <span className="min-w-32 flex-1">{e.jobId ? <Link href={`/jobs/${e.jobId}`} className="text-blue">{jobs.get(e.jobId)}</Link> : <span className="text-ink-soft">General</span>}{!e.endedAt && <span className="ml-2 rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-800">running</span>}</span>
              {e.approvedAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-800"><Lock className="size-3.5" />{hm(e.minutes ?? 0)} approved{e.note && <span className="text-ink-soft"> · {e.note}</span>}</span>
              ) : e.endedAt ? (
                <form action={timeUpdate} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} />
                  <input name="hours" defaultValue={`${Math.floor((e.minutes ?? 0) / 60)}:${String((e.minutes ?? 0) % 60).padStart(2, "0")}`} aria-label="Hours" className={`${inp} w-20`} />
                  <input name="note" defaultValue={e.note ?? ""} placeholder="Note" aria-label="Note" className={`${inp} w-40`} />
                  <button className="min-h-9 rounded-lg border border-line px-2 text-xs font-semibold">Save</button>
                </form>
              ) : <form action={timeStop} className="flex items-center gap-2"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><span className="text-ink-soft">{hm(mins(e))} so far</span><button className={btn}>Stop</button></form>}
              {!e.approvedAt && <form action={timeDelete}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><button aria-label="Delete entry" className="p-1 text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button></form>}
            </li>
          ))}
          {!inWeek.length && <li className="py-4 text-center text-ink-soft">No time this week. Clocking in and timers on visits fill this in.</li>}
        </ul>
        <form action={timeAdd} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <input type="hidden" name="back" value={back} />
          <select name="userId" aria-label="Person" className={inp}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input name="date" type="date" defaultValue={days.includes(today) ? today : monday} aria-label="Date" className={inp} />
          <input name="hours" required placeholder="1.5 or 1:30" aria-label="Hours" className={`${inp} w-24`} />
          <input name="note" placeholder="Note (general time)" aria-label="Note" className={`${inp} w-48`} />
          <button className="min-h-9 rounded-lg bg-navy px-3 text-sm font-semibold text-white">Add time</button>
        </form>
        <form action={timeApprove} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <input type="hidden" name="back" value={back} />
          <span className="font-semibold">Approve everyone&apos;s time up to</span>
          <input name="to" type="date" required defaultValue={days[6] < today ? days[6] : today} aria-label="Approve up to" className={inp} />
          <button className="min-h-9 rounded-lg border border-emerald-600 px-3 text-sm font-semibold text-emerald-800">Approve all to date</button>
          <span className="text-xs text-ink-soft">Approved time is locked until you un-approve it. Running clocks are left alone.</span>
        </form>
      </section>
    </>
  );
}
