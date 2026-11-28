// Team: everyone who can sign in (by email link), with their schedule colour and cost rate.
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { businessId, db } from "@/server/db";
import { personName } from "@/server/schedule";
import { teamSave } from "./actions";
import { hoursSave, timeOffAdd, timeOffDelete } from "./availability-actions";
import { dateOnly, todayLocal, toDbDate } from "@/server/dates";

export const metadata = { title: "Team" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#1d6fd8", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0e7490", "#4b5563"];

export default async function Team({ searchParams }: PageProps<"/settings/team">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const users = await db.user.findMany({ where: { businessId: bid }, orderBy: { createdAt: "asc" } });
  const offs = await db.timeOff.findMany({ where: { businessId: bid, endDate: { gte: toDbDate(todayLocal()) } }, orderBy: { startDate: "asc" } });
  const inp = "min-h-10 rounded-lg border border-line bg-white px-3 text-sm";
  const row = (u?: (typeof users)[number]) => (
    <form key={u?.id ?? "new"} action={teamSave} className="grid items-end gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[1.2fr_1.6fr_1fr_6rem_6rem_5rem_auto]">
      {u && <input type="hidden" name="id" value={u.id} />}
      <label className="text-xs font-semibold text-ink-soft">Name<input name="name" required defaultValue={u ? personName(u) : ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">Email (sign-in)<input name="email" type="email" required defaultValue={u?.email ?? ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">Phone<input name="phone" type="tel" defaultValue={u?.phone ?? ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">$ / hour<input name="cost" type="number" min={0} step="0.5" defaultValue={u ? u.hourlyCostCents / 100 : ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">Access
        <select name="role" defaultValue={u?.role ?? "CREW"} className={`${inp} mt-1 w-full`}><option value="CREW">Crew</option><option value="OWNER">Owner</option></select>
      </label>
      <label className="text-xs font-semibold text-ink-soft">Colour
        <select name="color" defaultValue={u?.color ?? COLORS[users.length % COLORS.length]} className={`${inp} mt-1 w-full`}>{COLORS.map((c) => <option key={c} value={c} style={{ color: c }}>■ {c}</option>)}</select>
      </label>
      <div className="flex items-center gap-3">
        {u && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} className="size-4" />Active</label>}
        <button className="min-h-10 rounded-lg bg-navy px-3 text-sm font-semibold text-white">{u ? "Save" : "Add"}</button>
      </div>
    </form>
  );
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Team" sub="Everyone here can sign in with an email link and be assigned visits and tasks. Crew only see their route for the day: no prices, billing, clients or settings. Cost per hour feeds job profit." />
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      <section className="rounded-lg border border-line bg-white px-4 shadow-card">{users.map((u) => row(u))}</section>
      <h2 className="mb-2 mt-6 text-base font-bold">Add someone</h2>
      <section className="rounded-lg border border-line bg-white px-4 shadow-card">{row()}</section>
      <h2 id="hours" className="mb-2 mt-8 text-base font-bold">Working hours</h2>
      <p className="mb-2 text-sm text-ink-soft">Used for Find a time, conflict warnings, and shading on the Team view.</p>
      <div className="space-y-3">
        {users.filter((u) => u.active).map((u) => {
          const h = (u.workHours ?? {}) as Record<string, [string, string]>;
          return (
            <form key={u.id} action={hoursSave} className="rounded-lg border border-line bg-white p-3 shadow-card">
              <input type="hidden" name="userId" value={u.id} />
              <p className="mb-2 flex items-center gap-2 text-sm font-bold"><span className="size-2.5 rounded-full" style={{ background: u.color }} />{personName(u)}</p>
              <div className="grid gap-2 sm:grid-cols-7">
                {DAYS.map((d, i) => (
                  <div key={d} className="rounded-md bg-tint p-2 text-xs">
                    <label className="flex items-center gap-1 font-semibold"><input type="checkbox" name={`on${i}`} defaultChecked={!!h[String(i)]} className="size-3.5" />{d}</label>
                    <input type="time" name={`s${i}`} defaultValue={h[String(i)]?.[0] ?? "08:00"} aria-label={`${d} start`} className="mt-1 w-full rounded border border-line bg-white px-1" />
                    <input type="time" name={`e${i}`} defaultValue={h[String(i)]?.[1] ?? "17:00"} aria-label={`${d} end`} className="mt-1 w-full rounded border border-line bg-white px-1" />
                  </div>
                ))}
              </div>
              <button className="mt-2 min-h-9 rounded-lg bg-navy px-3 text-sm font-semibold text-white">Save hours</button>
            </form>
          );
        })}
      </div>
      <h2 id="timeoff" className="mb-2 mt-8 text-base font-bold">Time off &amp; closed days</h2>
      <section className="rounded-lg border border-line bg-white p-4 shadow-card">
        <ul className="mb-3 divide-y divide-line text-sm">
          {offs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="font-semibold">{t.userId ? personName(users.find((u) => u.id === t.userId) ?? { name: "?", email: "?" }) : "Everyone (closed)"}</span> · {dateOnly(t.startDate)}{dateOnly(t.endDate) !== dateOnly(t.startDate) && ` to ${dateOnly(t.endDate)}`}{t.reason && ` · ${t.reason}`}</span>
              <form action={timeOffDelete}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-ink-soft hover:text-red-700">Remove</button></form>
            </li>
          ))}
          {!offs.length && <li className="py-2 text-ink-soft">None coming up.</li>}
        </ul>
        <form action={timeOffAdd} className="flex flex-wrap items-end gap-2 text-sm">
          <select name="userId" aria-label="Who" className="min-h-9 rounded-lg border border-line bg-white px-2"><option value="">Everyone (closed)</option>{users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{personName(u)}</option>)}</select>
          <input type="date" name="start" required aria-label="First day" className="min-h-9 rounded-lg border border-line px-2" />
          <input type="date" name="end" aria-label="Last day" className="min-h-9 rounded-lg border border-line px-2" />
          <input name="reason" placeholder="Reason (optional)" aria-label="Reason" className="min-h-9 rounded-lg border border-line px-2" />
          <button className="min-h-9 rounded-lg bg-navy px-3 font-semibold text-white">Add</button>
        </form>
      </section>
    </>
  );
}
