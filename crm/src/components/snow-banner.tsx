// Dashboard snow segment: a live storm's progress, or snow in the next few days and how many plans it would trigger.
// It renders inside the Home hero (a navy block), so everything here is styled for a dark surface.
import Link from "next/link";
import { CloudSnow, Snowflake } from "lucide-react";
import { addDays, prettyDate, todayLocal, toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { forecast, snowByDay } from "@/server/forecast";
import { plansTriggered } from "@/server/snow/select";

const onDark = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 sm:min-h-10";

export async function SnowBanner({ businessId }: { businessId: string }) {
  const active = await db.snowEvent.findFirst({ where: { businessId, status: "ACTIVE" }, orderBy: { activatedAt: "desc" } });
  if (active) {
    const [total, done] = await Promise.all([
      db.visit.count({ where: { snowEventId: active.id, state: { notIn: ["CANCELLED"] } } }),
      db.visit.count({ where: { snowEventId: active.id, state: { in: ["COMPLETED", "SKIPPED"] } } }),
    ]);
    const pct = total ? Math.round((100 * done) / total) : 0;
    return (
      <section data-snow aria-label="Storm in progress" className="flex min-w-0 flex-col">
        <p className="flex items-center gap-1.5 text-sm font-medium text-sky"><Snowflake className="size-4" strokeWidth={1.75} aria-hidden />Storm in progress · {active.measuredCm ?? "?"} cm</p>
        <p className="mt-2 font-display text-[1.7rem] font-semibold leading-none tabular-nums">{done} of {total} <span className="text-base font-medium text-white/70">driveways done</span></p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Storm progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-auto pt-4"><Link href={`/snow/${active.id}`} className={onDark}>Open the storm</Link></div>
      </section>
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
    <section data-snow aria-label="Snow in the forecast" className="flex min-w-0 flex-col">
      <p className="flex items-center gap-1.5 text-sm font-medium text-sky"><CloudSnow className="size-4" strokeWidth={1.75} aria-hidden />Snow in the forecast</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {snowy.map((d) => (
          <li key={d.day} className="rounded-lg bg-white/10 px-3 py-2 text-sm tabular-nums"><span className="font-semibold">{d.day === today ? "Today" : prettyDate(d.day)}</span> · {d.cm < 1 ? "<1" : `~${Math.round(d.cm)}`} cm{d.lo != null && ` · ${Math.round(d.lo)}° to ${Math.round(d.hi!)}°`}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-white/80">{hit ? <><span className="font-semibold text-white">{hit} plan{hit === 1 ? "" : "s"}</span> would trigger at ~{Math.round(peak)} cm.</> : "Below every plan's trigger so far."}</p>
      <p className="mt-1 text-xs text-white/60">Forecast: MET Norway, updated every 30 min. 1 mm of water ≈ 1 cm of snow.</p>
      <div className="mt-auto pt-4"><Link href="/snow" className={onDark}>Prepare for snow</Link></div>
    </section>
  );
}
