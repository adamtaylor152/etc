import Link from "next/link";
import { STORM } from "@/components/status";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { renewalCandidates, renewalSeason } from "@/server/ops/jobs";
import { sendRenewals, stormCreate } from "../work-actions";

export const metadata = { title: "Snow" };

export default async function Snow({ searchParams }: PageProps<"/snow">) {
  const sp = await searchParams;
  const bid = await businessId();
  const renewTarget = await renewalSeason(bid);
  const renewCount = renewTarget ? (await renewalCandidates(bid, renewTarget.id)).length : 0;
  const today = toDbDate(todayLocal());
  const season = await db.season.findFirst({ where: { businessId: bid, startsOn: { lte: today }, endsOn: { gte: today } } });
  const [storms, plans] = await Promise.all([
    db.snowEvent.findMany({
      where: { businessId: bid, ...(season ? { seasonId: season.id } : {}) }, orderBy: { number: "desc" },
      include: { _count: { select: { visits: true } }, visits: { where: { state: "COMPLETED" }, select: { id: true } } },
    }),
    season ? db.job.findMany({
      where: { businessId: bid, kind: "SNOW_PLAN", seasonId: season.id, closedAt: null },
      include: { client: true, property: { include: { community: true } } }, orderBy: { number: "asc" },
    }) : [],
  ]);
  const active = plans.filter((p) => !p.planPausedAt);
  const toCheck = await db.property.count({ where: { businessId: bid, sizeCheckedAt: null, archivedAt: null, jobs: { some: { closedAt: null, OR: [{ kind: "SNOW_PLAN" }, { kind: "ONE_OFF", title: { startsWith: "Snow" } }] } } } });
  return (
    <>
      <PageHeader title="Snow" sub={season ? `${season.name} · default trigger ${season.defaultTriggerCm} cm` : "No season covers today"} />
      {toCheck > 0 && <Link href="/snow/sizes" className="mb-4 block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">{toCheck} driveway{toCheck === 1 ? "" : "s"} need a size check before the next storm →</Link>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Storms">
            {storms.length ? (
              <ul className="divide-y divide-line">
                {storms.map((s) => (
                  <li key={s.id}>
                    <Link href={`/snow/${s.id}`} className="flex items-center justify-between gap-3 py-3">
                      <span><span className="font-semibold">{s.name}</span>
                        <span className="block text-sm text-ink-soft">{s.measuredCm ?? s.forecastCm ?? "?"} cm · {s.visits.length}/{s._count.visits} done{s.pushCount > 1 ? ` · ${s.pushCount} pushes` : ""}</span></span>
                      <Badge tone={STORM[s.status][1]}>{STORM[s.status][0]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No storms yet this season.</Empty>}
          </Card>
          <Card title={`Every-snowfall plans (${active.length} active)`}>
            {plans.length ? (
              <ul className="divide-y divide-line">
                {plans.map((p) => (
                  <li key={p.id}>
                    <Link href={`/jobs/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span><span className="font-semibold">{clientName(p.client)}</span><span className="block text-ink-soft">{p.property.formatted}</span></span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span>{p.triggerCm ?? season?.defaultTriggerCm} cm · {money(p.pricePerPushCents ?? 3000)}{p.iceMelt ? " + melt" : ""}</span>
                        {p.planPausedAt ? <Badge>Paused</Badge> : p.property.community && <Badge>{p.property.community.name}</Badge>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No plans yet. Every-snowfall bookings land here.</Empty>}
          </Card>
        </div>
        <Card title="It's snowing">
          <form action={stormCreate} className="space-y-3">
            <label className="block text-sm font-semibold">How much snow (cm)?<Input name="forecastCm" type="number" inputMode="numeric" min={0} max={300} required /></label>
            <label className="block text-sm font-semibold">Notes<Input name="notes" placeholder="e.g. heavy and wet overnight" /></label>
            <input type="hidden" name="start" value="1" />
            <Button className="w-full">Start storm</Button>
            <p className="text-xs text-ink-soft">Creates today&apos;s visits for every plan whose trigger this meets, plus one-time bookings waiting for snow.</p>
          </form>
        </Card>
        <Card title="Plan renewals" className="lg:col-start-3">
          {sp.renewals != null && <p className="mb-2 text-sm font-semibold text-emerald-700">{String(sp.renewals)} renewal email(s) queued.</p>}
          <p className="text-sm text-ink-soft">{renewTarget ? <>Email everyone who had a plan before but isn&apos;t on <b>{renewTarget.name}</b> yet ({renewCount}). They renew in one tap from their page.</> : "Set up next season in Settings first."}</p>
          {renewTarget && renewCount > 0 && <form action={sendRenewals} className="mt-3"><Button variant="secondary" className="w-full">Send renewal emails</Button></form>}
        </Card>
      </div>
    </>
  );
}
