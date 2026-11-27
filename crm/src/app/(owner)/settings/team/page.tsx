// Team: everyone who can sign in (by email link), with their schedule colour and cost rate.
import { DetailHeader } from "@/components/detail-header";
import { businessId, db } from "@/server/db";
import { personName } from "@/server/schedule";
import { teamSave } from "./actions";

export const metadata = { title: "Team" };
const COLORS = ["#1d6fd8", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0e7490", "#4b5563"];

export default async function Team({ searchParams }: PageProps<"/settings/team">) {
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { businessId: await businessId() }, orderBy: { createdAt: "asc" } });
  const inp = "min-h-10 rounded-lg border border-line bg-white px-3 text-sm";
  const row = (u?: (typeof users)[number]) => (
    <form key={u?.id ?? "new"} action={teamSave} className="grid items-end gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[1.2fr_1.6fr_1fr_6rem_5rem_auto]">
      {u && <input type="hidden" name="id" value={u.id} />}
      <label className="text-xs font-semibold text-ink-soft">Name<input name="name" required defaultValue={u ? personName(u) : ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">Email (sign-in)<input name="email" type="email" required defaultValue={u?.email ?? ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">Phone<input name="phone" type="tel" defaultValue={u?.phone ?? ""} className={`${inp} mt-1 w-full`} /></label>
      <label className="text-xs font-semibold text-ink-soft">$ / hour<input name="cost" type="number" min={0} step="0.5" defaultValue={u ? u.hourlyCostCents / 100 : ""} className={`${inp} mt-1 w-full`} /></label>
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
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Team" sub="Everyone here can sign in with an email link and be assigned visits and tasks. Cost per hour feeds job profit." />
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
      {sp.saved && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Saved.</p>}
      <section className="rounded-lg border border-line bg-white px-4 shadow-card">{users.map((u) => row(u))}</section>
      <h2 className="mb-2 mt-6 text-base font-bold">Add someone</h2>
      <section className="rounded-lg border border-line bg-white px-4 shadow-card">{row()}</section>
    </>
  );
}
