// Bulk reschedule & reassign (weather days, someone sick): pick visits/tasks, move them or hand them to someone else.
import { requireOwner } from "@/server/auth";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { fmtMin } from "@/server/availability";
import { todayLocal } from "@/server/dates";
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
  const sel = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <>
      <ScheduleTabs active="/schedule/bulk" />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
        <label>From<input type="date" name="from" defaultValue={from} className={`${sel} mt-1 block`} /></label>
        <label>To<input type="date" name="to" defaultValue={to} className={`${sel} mt-1 block`} /></label>
        <label>Person<select name="person" defaultValue={who} className={`${sel} mt-1 block`}><option value="">Everyone</option>{av.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Unassigned</option></select></label>
        <button className="min-h-9 rounded-lg border border-line px-3 font-semibold">Show</button>
      </form>
      {typeof sp.done === "string" && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">Updated {sp.done} item{sp.done === "1" ? "" : "s"}.</p>}
      <form action={bulkSchedule} className="rounded-lg border border-line bg-white shadow-card">
        <input type="hidden" name="back" value={`/schedule/bulk?from=${from}&to=${to}${who ? `&person=${who}` : ""}`} />
        <ul className="divide-y divide-line text-sm">
          {rows.map((b) => (
            <li key={b.id}>
              <label className="flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" name="item" value={`${visitState.has(b.id) ? "visit" : "task"}:${b.id}`} defaultChecked className="size-4" />
                <span className="w-28 text-ink-soft">{new Date(`${b.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}{b.start != null && ` ${fmtMin(b.start)}`}</span>
                <span className="flex-1 font-semibold">{b.label}</span>
                <span className="text-ink-soft">{b.userIds.map((u) => name.get(u)).join(", ") || "Unassigned"}</span>
              </label>
            </li>
          ))}
          {!rows.length && <li className="p-6 text-center text-ink-soft">Nothing scheduled in that range (storm visits and finished work are left out).</li>}
        </ul>
        {rows.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-t border-line p-3 text-sm">
            <label>Move to<input type="date" name="moveTo" min={today} className={`${sel} mt-1 block`} /></label>
            <span className="pb-2 text-ink-soft">or</span>
            <label>Shift by<select name="shift" defaultValue="0" className={`${sel} mt-1 block`}>{[-2, -1, 0, 1, 2, 3, 7].map((n) => <option key={n} value={n}>{n === 0 ? "—" : `${n > 0 ? "+" : ""}${n} day${Math.abs(n) === 1 ? "" : "s"}`}</option>)}</select></label>
            <label>Assign to<select name="assign" defaultValue="keep" className={`${sel} mt-1 block`}><option value="keep">Keep as is</option>{av.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Nobody</option></select></label>
            <label className="flex items-center gap-1.5 pb-2"><input type="checkbox" name="notify" defaultChecked className="size-4" />Email clients the new date</label>
            <button className="min-h-10 rounded-lg bg-blue px-4 font-semibold text-white">Apply to selected</button>
          </div>
        )}
      </form>
      <p className="mt-2 text-xs text-ink-soft">Times of day are kept. Moving clears any client confirmation for the old day; the day-before reminder asks them again.</p>
    </>
  );
}
