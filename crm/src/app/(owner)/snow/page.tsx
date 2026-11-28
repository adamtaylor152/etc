import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { STORM } from "@/components/status";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ChevronRight } from "lucide-react";
import { todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { renewalCandidates, renewalSeason } from "@/server/ops/jobs";
import { DepthTierFields } from "@/components/depth-tier-fields";
import { getSettings } from "@/server/settings";
import { parseTiers } from "@/server/snow/tiers";
import { saveSnowPricing } from "../settings/actions";
import { sendRenewals, stormCreate } from "../work-actions";

export const metadata = { title: "Snow" };

export default async function Snow({ searchParams }: PageProps<"/snow">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const settings = await getSettings(db, bid);
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
      include: { client: true, property: { include: { community: true } }, invoices: { where: { instalmentKey: { not: null }, status: "PAID" }, select: { id: true } } }, orderBy: { number: "asc" },
    }) : [],
  ]);
  const active = plans.filter((p) => !p.planPausedAt);
  const toCheck = await db.property.count({ where: { businessId: bid, sizeCheckedAt: null, archivedAt: null, jobs: { some: { closedAt: null, OR: [{ kind: "SNOW_PLAN" }, { kind: "ONE_OFF", title: { startsWith: "Snow" } }] } } } });
  const row = "group -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-tint";
  return (
    <>
      <PageHeader title="Snow" sub={season ? <span className="tabular-nums">{season.name} · default trigger {season.defaultTriggerCm} cm</span> : "No season covers today"} />
      {toCheck > 0 && (
        <Link href="/snow/sizes" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-950 hover:border-amber-300 hover:bg-amber-100">
          <span><span className="tabular-nums">{toCheck}</span> driveway{toCheck === 1 ? "" : "s"} need{toCheck === 1 ? "s" : ""} a size check before the next storm</span><ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Storms" actions={storms.length > 0 && <span className="text-xs font-medium tabular-nums text-ink-soft">{storms.length} storm{storms.length === 1 ? "" : "s"}</span>}>
            {storms.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {storms.map((s) => (
                  <li key={s.id}>
                    <Link href={`/snow/${s.id}`} className={row}>
                      <span className="min-w-0"><span className="font-semibold group-hover:text-blue-deep">{s.name}</span>
                        <span className="block text-sm tabular-nums text-ink-soft">{s.measuredCm ?? s.forecastCm ?? "?"} cm · {s.visits.length} of {s._count.visits} done{s.pushCount > 1 ? ` · ${s.pushCount} pushes` : ""}</span></span>
                      <Badge tone={STORM[s.status][1]}>{STORM[s.status][0]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No storms yet this season. When it snows, enter the depth under “It&apos;s snowing” to start one.</Empty>}
          </Card>
          <Card title="Every-snowfall plans" actions={plans.length > 0 && <span className="text-xs font-medium tabular-nums text-ink-soft">{active.length} active{plans.length > active.length ? ` · ${plans.length - active.length} paused` : ""}</span>}>
            {plans.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {plans.map((p) => (
                  <li key={p.id}>
                    <Link href={`/jobs/${p.id}`} className={`${row} text-sm`}>
                      <span className="min-w-0"><span className="font-semibold group-hover:text-blue-deep">{clientName(p.client)}</span><span className="block text-ink-soft">{p.property.formatted}</span></span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-right tabular-nums">{p.triggerCm ?? season?.defaultTriggerCm} cm · {p.snowBillingMode === "SEASONAL"
                          ? `${money(p.seasonalPriceCents ?? 0)} season · ${p.invoices.length}/${p.seasonalInstalments ?? 1} paid${p.iceMelt && !p.addonsIncluded ? " + melt" : ""}`
                          : `${parseTiers(p.depthTiers).length ? "from " : ""}${money(p.pricePerPushCents ?? 3000)}${p.snowBillingMode === "PER_EVENT" ? " per storm" : ""}${p.iceMelt ? " + melt" : ""}`}</span>
                        {p.planPausedAt ? <Badge tone="amber">Paused</Badge> : p.property.community && <span className="text-xs text-ink-soft">{p.property.community.name}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>No plans yet. Every-snowfall bookings land here.</Empty>}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="It's snowing">
            <form action={stormCreate} className="space-y-3">
              <Field label="How much snow (cm)?"><Input name="forecastCm" type="number" inputMode="numeric" min={0} max={300} required /></Field>
              <Field label="Notes"><Input name="notes" placeholder="e.g. heavy and wet overnight" /></Field>
              <input type="hidden" name="start" value="1" />
              <Button className="w-full">Start storm</Button>
              <p className="text-xs text-ink-soft">Creates today&apos;s visits for every plan whose trigger this meets, plus one-time bookings waiting for snow.</p>
            </form>
          </Card>
          <Card title="Snow pricing">
            {sp.saved === "pricing" && <Notice tone="good">Saved.</Notice>}
            {sp.error && <Notice tone="bad">{String(sp.error)}</Notice>}
            {/* The tier rows are built for a wide form; in this side column they stack and their boxes narrow to fit. */}
            <form action={saveSnowPricing} className="space-y-3 lg:[&_fieldset>div]:grid-cols-1! lg:[&_fieldset_input]:w-16!">
              <DepthTierFields tiers={settings.depthTiers} hint="What a new plan starts with; each plan keeps its own copy, changed on its plan card. Plans you already have are not touched, and online bookings stay at the flat price the client saw." />
              <Field label="Billable return visit (% of the plan's clearing price)" hint="A return visit is one more trip on the same storm (the city plough buried the driveway end). When you add one you choose included (no charge) or billable at this share of the plan's base price.">
                <Input name="returnVisitPct" type="number" inputMode="numeric" min={0} max={200} step={1} defaultValue={settings.returnVisitPct} className="w-28!" />
              </Field>
              <Button variant="secondary" className="w-full">Save snow pricing</Button>
            </form>
          </Card>
          <Card title="Plan renewals">
            {sp.renewals != null && <Notice tone="good"><span className="tabular-nums">{String(sp.renewals)}</span> renewal email(s) queued.</Notice>}
            <p className="text-sm text-ink-soft">{renewTarget ? <>Email everyone who had a plan before but isn&apos;t on <span className="font-semibold text-navy">{renewTarget.name}</span> yet (<span className="tabular-nums">{renewCount}</span>). They renew in one tap from their page.</> : "Set up next season in Settings first."}</p>
            {renewTarget && renewCount > 0 && <form action={sendRenewals} className="mt-3"><Button variant="secondary" className="w-full">Send renewal emails</Button></form>}
          </Card>
        </div>
      </div>
    </>
  );
}
