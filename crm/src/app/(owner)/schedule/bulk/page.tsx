// Bulk reschedule & reassign (weather days, someone sick): pick visits/tasks, move them or hand them to someone else.
import { requireOwner } from "@/server/auth";
import { Flash } from "@/components/flash";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { Button, Card, Empty, Field, Input, inputCls, Notice } from "@/components/ui";
import { prettyMinutes, todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { loadAvailability } from "@/server/schedule-data";
import { bulkSchedule } from "../../schedule-actions";

export const metadata = { title: "Bulk schedule changes" };

export default async function Bulk({ searchParams }: PageProps<"/schedule/bulk">) {
  await requireOwner();
  const sp = await searchParams;
  const today = todayLocal();
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to >= from ? sp.to : from;
  const who = typeof sp.person === "string" ? sp.person : "";
  const av = await loadAvailability(await businessId(), from, to);
  const visitState = new Map(av.visits.map((v) => [v.id, v]));
  const rows = av.busy.filter((b) => {
    const v = visitState.get(b.id);
    if (v && (v.state !== "SCHEDULED" || v.snowEventId)) return false; // done and storm visits stay put
    return !who || (who === "none" ? !b.userIds.length : b.userIds.includes(who));
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 9999) - (b.start ?? 9999));
  const name = new Map(av.people.map((p) => [p.id, p.name]));
  const color = new Map(av.people.map((p) => [p.id, p.color]));
  return (
    <>
      <ScheduleTabs active="/schedule/bulk" sub="For weather days or when someone is out: pick what is on the schedule, then move it or hand it to someone else." />
      <Flash error={sp.error} />
      {typeof sp.done === "string" && <Notice tone="good">Updated {sp.done} item{sp.done === "1" ? "" : "s"}.</Notice>}
      <Card className="mb-5">
        <form className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <div className="sm:w-40"><Field label="From"><Input type="date" name="from" defaultValue={from} /></Field></div>
          <div className="sm:w-40"><Field label="To"><Input type="date" name="to" defaultValue={to} /></Field></div>
          <div className="sm:w-44"><Field label="Person"><select name="person" defaultValue={who} className={inputCls}><option value="">Everyone</option>{av.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Unassigned</option></select></Field></div>
          <Button variant="secondary">Show</Button>
        </form>
      </Card>
      {rows.length ? (
        <form action={bulkSchedule} className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
          <input type="hidden" name="back" value={`/schedule/bulk?from=${from}&to=${to}${who ? `&person=${who}` : ""}`} />
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-display text-[0.95rem] font-semibold">On the schedule <span className="font-sans text-sm font-normal tabular-nums text-ink-soft">({rows.length})</span></h2>
            <p className="mt-0.5 text-xs text-ink-soft">Everything starts ticked. Untick anything that should stay as it is.</p>
          </div>
          <ul className="divide-y divide-line-soft text-sm">
            {rows.map((b) => (
              <li key={b.id}>
                <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 hover:bg-tint/60 sm:px-5">
                  <input type="checkbox" name="item" value={`${visitState.has(b.id) ? "visit" : "task"}:${b.id}`} defaultChecked className="size-4 shrink-0" />
                  <span className="w-24 shrink-0 tabular-nums text-ink-soft">{new Date(`${b.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</span>
                  <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-ink-soft">{b.start != null ? prettyMinutes(b.start) : "Any time"}</span>
                  <span className="min-w-0 flex-1 font-semibold max-sm:basis-full max-sm:pl-7">{b.label}</span>
                  <span className="flex items-center gap-1.5 text-ink-soft max-sm:w-full max-sm:pl-7">
                    {b.userIds.length ? b.userIds.map((u) => <span key={u} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: color.get(u) }} aria-hidden />{name.get(u)}</span>) : "Unassigned"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <fieldset className="border-t border-line bg-tint/60 px-4 py-4 sm:px-5">
            <legend className="sr-only">What to do with the ticked items</legend>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Field label="Move to"><Input type="date" name="moveTo" min={today} /></Field></div>
              <span className="pb-2.5 text-sm text-ink-soft">or</span>
              <div className="w-32"><Field label="Shift by"><select name="shift" defaultValue="0" className={inputCls}>{[-2, -1, 0, 1, 2, 3, 7].map((n) => <option key={n} value={n}>{n === 0 ? "No shift" : `${n > 0 ? "+" : "−"}${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`}</option>)}</select></Field></div>
              <div className="w-40"><Field label="Assign to"><select name="assign" defaultValue="keep" className={inputCls}><option value="keep">Keep as is</option>{av.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Nobody</option></select></Field></div>
              <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="size-4" />Email clients the new date</label>
              <Button className="sm:ml-auto">Apply to ticked items</Button>
            </div>
            <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">Times of day are kept. Moving clears any client confirmation for the old day; the day-before reminder asks them again.</p>
          </fieldset>
        </form>
      ) : <Empty>Nothing scheduled in that range (storm visits and finished work are left out). Try a wider range of dates.</Empty>}
    </>
  );
}
