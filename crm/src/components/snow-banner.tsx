// Dashboard snow banner: a live storm's progress, or snow in the next few days and how many plans it would trigger.
import Link from "next/link";
import { addDays, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { forecast, snowByDay } from "@/server/forecast";
import { plansTriggered } from "@/server/snow/select";

export async function SnowBanner({ businessId }: { businessId: string }) {
  const active = await db.snowEvent.findFirst({ where: { businessId, status: "ACTIVE" }, orderBy: { activatedAt: "desc" } });
  if (active) {
    const [total, done] = await Promise.all([
      db.visit.count({ where: { snowEventId: active.id, state: { notIn: ["CANCELLED"] } } }),
      db.visit.count({ where: { snowEventId: active.id, state: { in: ["COMPLETED", "SKIPPED"] } } }),
    ]);
    return (
      <Link href={`/snow/${active.id}`} className="mb-5 block rounded-3xl bg-navy p-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-wider text-sky">❄ Storm in progress · {active.measuredCm ?? "?"} cm</div>
        <div className="mt-1 font-display text-2xl font-bold">{done} of {total} done</div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-emerald-400" style={{ width: `${total ? Math.round((100 * done) / total) : 0}%` }} /></div>
        <div className="mt-3 text-sm font-semibold text-white/80">Open the storm →</div>
      </Link>
    );
  }
  const periods = await forecast();
  if (!periods) return null;
  const today = todayLocal();
  const snowy = snowByDay(periods).filter((d) => d.day >= today && d.day <= addDays(today, 3) && d.cm >= 0.5);
  if (!snowy.length) return null;
  const season = await db.season.findFirst({ where: { businessId, startsOn: { lte: toDbDate(today) }, endsOn: { gte: toDbDate(today) } } });
  const plans = season ? await db.job.findMany({ where: { businessId, kind: "SNOW_PLAN", seasonId: season.id, closedAt: null, planPausedAt: null }, select: { id: true, triggerCm: true, planPausedAt: true, closedAt: true } }) : [];
  const peak = Math.max(...snowy.map((d) => d.cm));
  const hit = season ? plansTriggered(plans, Math.floor(peak), season.defaultTriggerCm).length : 0;
  return (
    <div className="mb-5 rounded-3xl border border-blue/30 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-blue">❄ Snow in the forecast</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {snowy.map((d) => (
          <span key={d.day} className="rounded-xl bg-tint px-3 py-2 text-sm"><b>{d.day === today ? "Today" : prettyDate(d.day)}</b> · {d.cm < 1 ? "<1" : `~${Math.round(d.cm)}`} cm{d.lo != null && ` · ${Math.round(d.lo)}° to ${Math.round(d.hi!)}°`}</span>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-soft">{hit ? <><b className="text-navy">{hit} plan{hit === 1 ? "" : "s"}</b> would trigger at ~{Math.round(peak)} cm.</> : "Below every plan's trigger so far."} <Link href="/snow" className="font-semibold text-blue">Prepare →</Link></p>
      <p className="mt-1 text-xs text-ink-soft">Forecast: MET Norway, updated every 30 min. 1 mm of water ≈ 1 cm of snow.</p>
    </div>
  );
}
