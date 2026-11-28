// Time sheets: one week at a time, a row per person, minutes per day, and every entry (editable until approved).
// Approving locks a person's week (or everyone's time up to a date) until an owner un-approves it.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Download, Lock, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { Flash } from "@/components/flash";
import { Button, ButtonLink, Card, PageHeader, btn, inputCls } from "@/components/ui";
import { timeAdd, timeApprove, timeDelete, timeStop, timeUnapprove, timeUpdate } from "../costing-actions";
import { addDays, mondayOf, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { hm } from "@/server/ops/costing";
import { personName, team } from "@/server/schedule";

export const metadata = { title: "Time sheets" };
const local = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
const utc = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { ...o, timeZone: "UTC" });

/** A clock that is still going: a pulsing dot plus the word, so it reads at a glance and without colour. */
function Running() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold leading-5 text-emerald-800">
      <span className="relative flex size-2" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-emerald-600" /></span>Running
    </span>
  );
}

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
  const back = `/timesheets?week=${monday}`, csv = `/api/export/report/timesheets?from=${monday}&to=${days[6]}`;
  const small = "min-h-9 px-3 text-xs";
  const lbl = "mb-1 block text-xs font-medium text-ink-soft";
  const sum = (list: typeof inWeek) => list.reduce((n, e) => n + mins(e), 0);
  const weekTotal = sum(inWeek), weekOk = sum(inWeek.filter((e) => e.approvedAt));
  const running = inWeek.filter((e) => !e.endedAt).length;
  const isThisWeek = days.includes(today);
  return (
    <>
      <PageHeader title="Time sheets"
        sub={<><span className="font-medium tabular-nums text-navy">{utc(monday, { month: "short", day: "numeric" })} – {utc(days[6], { month: "short", day: "numeric", year: "numeric" })}</span>{isThisWeek && " · this week"}{running > 0 && <> · {running} clock{running === 1 ? "" : "s"} running</>}</>}
        actions={<>
          <div className="inline-flex items-center gap-1">
            <Link href={`/timesheets?week=${addDays(monday, -7)}`} className={btn("secondary", "px-2.5")} aria-label="Previous week"><ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden /></Link>
            {isThisWeek ? <span aria-current="true" className="inline-flex min-h-10 items-center rounded-lg border border-blue/20 bg-blue/10 px-3 text-sm font-semibold text-blue-deep">This week</span> : <ButtonLink href="/timesheets">This week</ButtonLink>}
            <Link href={`/timesheets?week=${addDays(monday, 7)}`} className={btn("secondary", "px-2.5")} aria-label="Next week"><ChevronRight className="size-4" strokeWidth={1.75} aria-hidden /></Link>
          </div>
          <a href={csv} className={btn("secondary")}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download CSV</a>
          <ButtonLink href="/time">My clock</ButtonLink>
        </>} />
      <Flash error={sp.error} />

      <Card className="mb-5 overflow-hidden p-0!">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
          <h2 className="font-display text-[0.95rem] font-semibold">Week by person</h2>
          <p className="text-xs tabular-nums text-ink-soft"><span className="font-semibold text-navy">{hm(weekTotal)}</span> total · {hm(weekOk)} approved · {hm(weekTotal - weekOk)} not yet</p>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-xs font-medium text-ink-soft">
                <th scope="col" className="sticky left-0 z-10 border-b border-line bg-white px-4 py-2.5 text-left font-medium">Person</th>
                {days.map((d) => <th key={d} scope="col" className={`whitespace-nowrap border-b border-line px-2 py-2.5 text-right font-medium ${d === today ? "bg-tint font-semibold text-navy" : ""}`}>{utc(d, { weekday: "short", day: "numeric" })}{d === today && <span className="block text-[0.7rem] font-medium text-blue-deep">today</span>}</th>)}
                <th scope="col" className="border-b border-l border-line px-3 py-2.5 text-right font-medium">Total</th>
                <th scope="col" className="border-b border-line px-3 py-2.5 text-right font-medium">Approved</th>
                <th scope="col" className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right font-medium">Not yet</th>
                <th scope="col" className="border-b border-line px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const mine = inWeek.filter((e) => e.userId === p.id);
                const ok = mine.filter((e) => e.approvedAt).reduce((n, e) => n + mins(e), 0), open = mine.reduce((n, e) => n + mins(e), 0) - ok;
                const hid = <><input type="hidden" name="userId" value={p.id} /><input type="hidden" name="from" value={monday} /><input type="hidden" name="to" value={days[6]} /><input type="hidden" name="back" value={back} /></>;
                const cellB = "border-b border-line-soft";
                return (
                  <tr key={p.id}>
                    <th scope="row" className={`sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-left font-semibold ${cellB}`}><span className="mr-2 inline-block size-2.5 rounded-full align-baseline" style={{ background: p.color }} aria-hidden />{p.name}</th>
                    {days.map((d) => { const m = mine.filter((e) => local(e.startedAt) === d).reduce((n, e) => n + mins(e), 0); return <td key={d} className={`whitespace-nowrap px-2 py-3 text-right tabular-nums ${cellB} ${d === today ? "bg-tint" : ""}`}>{m ? hm(m) : <span className="text-ink-faint" aria-label="none">–</span>}</td>; })}
                    <td className={`whitespace-nowrap border-l border-line px-3 py-3 text-right font-semibold tabular-nums ${cellB}`}>{hm(ok + open)}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${cellB} ${ok ? "font-medium text-emerald-700" : "text-ink-faint"}`}>{ok ? hm(ok) : "–"}</td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${cellB} ${open ? "font-medium text-amber-800" : "text-ink-faint"}`}>{open ? hm(open) : "–"}</td>
                    <td className={`px-4 py-2 ${cellB}`}>
                      <span className="flex justify-end gap-1.5 whitespace-nowrap">
                        {mine.some((e) => e.endedAt && !e.approvedAt) && <form action={timeApprove}>{hid}<Button variant="secondary" className={small}><Check className="size-4 text-emerald-700" strokeWidth={2} aria-hidden />Approve week</Button></form>}
                        {ok > 0 && <form action={timeUnapprove}>{hid}<Button variant="secondary" className={small}>Un-approve</Button></form>}
                        {mine.length > 0 && <a href={`${csv}&person=${p.id}`} className={btn("secondary", small)} aria-label={`Download CSV for ${p.name}`}>CSV</a>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!people.length && <p className="px-4 py-8 text-center text-sm text-ink-soft">No team members yet. Add people in Settings.</p>}
        <form action={timeApprove} className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-line bg-tint/50 px-4 py-3 text-sm">
          <input type="hidden" name="back" value={back} />
          <label><span className={lbl}>Approve everyone&apos;s time up to</span><input name="to" type="date" required defaultValue={days[6] < today ? days[6] : today} className={`${inputCls} w-auto!`} /></label>
          <Button><Check className="size-4" strokeWidth={2} aria-hidden />Approve all to date</Button>
          <span className="max-w-[48ch] basis-full text-xs text-ink-soft lg:basis-auto lg:self-center">Approved time is locked until you un-approve it. Running clocks are left alone.</span>
        </form>
      </Card>

      <Card title="Entries" className="mb-5">
        {inWeek.length ? (
          <div className="-mt-1">
            {days.filter((d) => inWeek.some((e) => local(e.startedAt) === d)).map((d) => {
              const list = inWeek.filter((e) => local(e.startedAt) === d);
              return (
                <section key={d} className="mt-4 first:mt-0">
                  <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-xs font-medium text-ink-soft">
                    <span>{utc(d, { weekday: "long", month: "short", day: "numeric" })}{d === today && " · today"}</span><span className="tabular-nums">{hm(sum(list))}</span>
                  </h3>
                  <ul className="divide-y divide-line-soft text-sm">
                    {list.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                        <span className="w-28 shrink-0 truncate font-semibold">{personName(e.user)}</span>
                        <span className="flex min-w-32 flex-1 flex-wrap items-center gap-2">{e.jobId ? <Link href={`/jobs/${e.jobId}`} className="font-medium text-blue hover:text-blue-deep max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">{jobs.get(e.jobId)}</Link> : <span className="text-ink-soft">General</span>}{!e.endedAt && <Running />}</span>
                        <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                        {e.approvedAt ? (
                          <span className="mr-auto inline-flex items-center gap-1.5 text-emerald-700 sm:mr-0"><Lock className="size-3.5" strokeWidth={1.75} aria-hidden /><span className="font-medium tabular-nums">{hm(e.minutes ?? 0)}</span> approved{e.note && <span className="text-ink-soft">· {e.note}</span>}</span>
                        ) : e.endedAt ? (
                          <form action={timeUpdate} className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} />
                            <input name="hours" defaultValue={`${Math.floor((e.minutes ?? 0) / 60)}:${String((e.minutes ?? 0) % 60).padStart(2, "0")}`} aria-label={`Hours for ${personName(e.user)}`} className={`${inputCls} min-h-9! w-20! px-2! py-1! text-right tabular-nums`} />
                            <input name="note" defaultValue={e.note ?? ""} placeholder="Note" aria-label="Note" className={`${inputCls} min-h-9! min-w-0 flex-1 px-2! py-1! sm:w-44! sm:flex-none`} />
                            <Button variant="secondary" className={small}>Save</Button>
                          </form>
                        ) : (
                          <form action={timeStop} className="flex flex-1 items-center justify-between gap-2 sm:flex-none"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><span className="tabular-nums text-ink-soft"><span className="font-medium text-navy">{hm(mins(e))}</span> so far</span><Button variant="secondary" className={small}>Stop clock</Button></form>
                        )}
                        {!e.approvedAt ? <form action={timeDelete}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} /><ConfirmButton message="Delete this time entry?" aria-label={`Delete entry for ${personName(e.user)}`} className="inline-flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" strokeWidth={1.75} aria-hidden /></ConfirmButton></form> : <span className="hidden size-9 sm:block" aria-hidden />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : <p className="rounded-xl border border-dashed border-line bg-tint/40 px-6 py-8 text-center text-sm text-ink-soft">No time this week. Clocking in and timers on visits fill this in, or add time below.</p>}
      </Card>

      <Card title="Add time by hand">
        <form action={timeAdd} className="grid grid-cols-2 items-end gap-x-2 gap-y-3 md:grid-cols-[11rem_10rem_7rem_1fr_auto]">
          <input type="hidden" name="back" value={back} />
          <label><span className={lbl}>Person</span><select name="userId" className={inputCls}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span className={lbl}>Date</span><input name="date" type="date" defaultValue={days.includes(today) ? today : monday} className={inputCls} /></label>
          <label><span className={lbl}>Hours</span><input name="hours" required placeholder="1.5 or 1:30" className={`${inputCls} tabular-nums`} /></label>
          <label><span className={lbl}>Note</span><input name="note" placeholder="General time, not on a job" className={inputCls} /></label>
          <Button variant="secondary" className="col-span-2 md:col-span-1">Add time</Button>
        </form>
      </Card>
    </>
  );
}
