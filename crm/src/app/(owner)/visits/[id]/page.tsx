import { siteFacts } from "@/server/clients";
import { SignatureCard } from "@/components/signatures";
import { VisitChecklistCard } from "@/components/visit-checklist";
import { assignPeople } from "../../schedule-actions";
import { personName, team } from "@/server/schedule";
import { VisitTimer } from "@/components/visit-timer";
import { hm } from "@/server/ops/costing";
import { requireOwner } from "@/server/auth";
// Field view: what Silas sees standing in the driveway. Big buttons, everything on one screen.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { Gallery } from "@/components/gallery";
import { GeoFields } from "@/components/geo-fields";
import { PhotoUploader } from "@/components/photo-uploader";
import { VisitBadge } from "@/components/status";
import { Button, ButtonLink, Card, Dl, Field, Input, Notice, btn, inputCls } from "@/components/ui";
import { Check, ChevronLeft, ChevronRight, Navigation, Phone, TriangleAlert, User } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { canTransition } from "@/server/status/visit";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { mapsLink, routeVisits } from "@/server/routing";
import { visitLinesLock, visitStatus } from "@/server/status/job";
import { parseOverrides } from "@/server/billing/charges";
import { LineItems } from "@/components/line-items";
import { visitLinesSet } from "../../recurring-actions";
import { paymentRecord } from "../../billing-actions";
import { visitIceMeltBags, visitReturn, visitTransition } from "../../work-actions";
import { isSnowVisit, onSiteMinutes, usualByProperty, usualKey } from "@/server/ops/visit-times";
import { getSettings } from "@/server/settings";
import { SKIP_LABEL, skipLabel } from "@/server/status/visit";
import { returnVisitPrice } from "@/server/snow/tiers";

// The reasons the office can pick here ("below the trigger depth" is set by the storm tools, not by hand).
const SKIP = (["ALREADY_CLEARED", "BLOCKED_BY_CAR", "NO_ACCESS", "CLIENT_CANCELLED", "WEATHER", "OTHER"] as const).map((k) => [k, SKIP_LABEL[k]] as const);

export async function generateMetadata({ params }: PageProps<"/visits/[id]">) {
  await requireOwner();
  const v = await db.visit.findFirst({ where: { id: (await params).id, businessId: await businessId() }, select: { property: { select: { formatted: true } } } });
  return { title: v ? `Visit · ${v.property.formatted.split(",")[0]}` : "Visit" };
}

export default async function VisitPage({ params, searchParams }: PageProps<"/visits/[id]">) {
  const user = await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const v = await db.visit.findFirst({
    where: { id, businessId: bid },
    include: {
      job: { include: { client: true, lineItems: true } }, property: { include: { community: true } }, snowEvent: true, charges: true, assignees: true, extras: { orderBy: { createdAt: "asc" } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!v) notFound();
  const here = `/visits/${id}`;
  const status = visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, todayLocal());
  const open = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state);
  const hasIceMelt = v.job.iceMelt || v.job.lineItems.some((l) => l.name === "Ice melt");
  const invoice = await db.invoice.findFirst({ where: { businessId: bid, status: { not: "VOID" }, lineItems: { some: { visitId: v.id } } } });
  const owing = invoice ? invoice.totalCents - invoice.amountPaidCents : 0;
  const tel = v.job.client.phone ? `tel:${v.job.client.phone.replace(/[^\d+]/g, "")}` : null;

  // Next stop on the same storm (or the same day), in route order.
  let nextStop: string | null = null;
  const sameRun = v.snowEventId ? { snowEventId: v.snowEventId } : v.scheduledDate ? { scheduledDate: v.scheduledDate } : null;
  if (sameRun) {
    const { visits } = await routeVisits(bid, { ...sameRun, state: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] } });
    const after = visits.slice(visits.findIndex((x) => x.id === id) + 1).find((x) => x.id !== id) ?? visits.find((x) => x.id !== id);
    nextStop = after?.id ?? null;
  }

  const hidden = (to: string) => <><input type="hidden" name="id" value={v.id} /><input type="hidden" name="to" value={to} /><input type="hidden" name="back" value={here} /></>;

  // One visit can be priced differently from its job (Visit.lineOverrides) until it's invoiced.
  const overrides = parseOverrides(v.lineOverrides);
  const priced: { name: string; description?: string | null; quantity: unknown; unitPriceCents: number }[] = overrides ?? v.job.lineItems.filter((l) => l.perVisit).sort((a, b) => a.sortOrder - b.sortOrder);
  const linesLock = visitLinesLock({ state: v.state, invoiced: v.charges.some((c) => c.invoiceLineItemId), kind: v.job.kind, billingType: v.job.billingType, closedAt: v.job.closedAt });
  const services = linesLock ? [] : await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });

  const people = await team(v.businessId);
  const [running, visitTime] = await Promise.all([
    db.timeEntry.findFirst({ where: { businessId: v.businessId, userId: user.id, endedAt: null } }),
    db.timeEntry.findMany({ where: { businessId: v.businessId, visitId: v.id, endedAt: { not: null } }, include: { user: true } }),
  ]);
  const took = onSiteMinutes(v, visitTime), usual = (await usualByProperty(v.businessId, [v.propertyId])).get(usualKey(v.propertyId, isSnowVisit(v))) ?? null;
  // What a billable return visit would cost right now (addReturnVisit uses the same rule).
  const returnCents = v.state === "COMPLETED" && v.snowEventId && !v.job.closedAt
    ? returnVisitPrice(v.job.kind === "SNOW_PLAN" ? v.job.pricePerPushCents ?? 3000 : v.job.lineItems.filter((l) => l.perVisit).reduce((a, l) => a + l.totalCents, 0), (await getSettings(db, v.businessId)).returnVisitPct) : null;
  const heroBtn = "flex min-h-12 items-center justify-center gap-2 rounded-lg text-base font-semibold focus-visible:outline-sky";
  const big = "min-h-14! w-full text-base!";
  // One numbered step of the On my way / Arrived / Done sequence; a step already taken shows a tick instead of its number.
  const step = (n: number, passed: boolean) => (
    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${passed ? "bg-emerald-50 text-emerald-700" : "bg-tint text-ink-soft"}`} aria-hidden>{passed ? <Check className="size-4" /> : n}</span>
  );
  const hasNotes = v.property.accessNotes || v.property.gateCode || v.property.hazards || v.property.petNotes || v.job.instructions || v.instructions || siteFacts(v.property);
  return (
    <div className="mx-auto max-w-3xl lg:max-w-6xl">
      <Link href={`/jobs/${v.jobId}`} className="-ml-1 mb-2 inline-flex min-h-8 max-sm:min-h-11 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-ink-soft hover:text-navy"><ChevronLeft className="size-4" aria-hidden />Job #{v.job.number}</Link>
      <Flash error={sp.error} />
      {/* One column in phone order up to tablet; from lg the site facts sit left and the work (do it, price, people) right. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rounded-2xl bg-navy p-5 text-white lg:col-span-2 lg:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-sky">{v.snowEvent ? `${v.snowEvent.name}${v.pushNumber ? ` · push ${v.pushNumber}` : ""}` : v.job.title}{v.isReturn && " · Return visit"}</p>
            {/* Badges are tinted for white cards; a white pill behind keeps every tone readable on the navy header. */}
            <span className="shrink-0 rounded-full bg-white"><VisitBadge s={status} /></span>
          </div>
          <h1 className="mt-1.5 font-display text-[1.7rem] font-semibold leading-tight [overflow-wrap:anywhere] lg:text-[2.1rem]">{v.property.formatted}</h1>
          <p className="mt-1 text-white/75">{clientName(v.job.client)}{v.property.community && ` · ${v.property.community.name}`} · <span className="tabular-nums">{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Not scheduled"}</span></p>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:max-w-md">
            <a href={mapsLink(v.property.formatted)} className={`${heroBtn} bg-white text-navy hover:bg-tint`}><Navigation className="size-4" aria-hidden />Navigate</a>
            {tel ? <a href={tel} className={`${heroBtn} border border-white/35 text-white hover:bg-white/10`}><Phone className="size-4" aria-hidden />Call</a>
              : <Link href={`/clients/${v.job.clientId}`} className={`${heroBtn} border border-white/35 text-white hover:bg-white/10`}><User className="size-4" aria-hidden />Client</Link>}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
        {hasNotes && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-[0.95rem] font-semibold"><TriangleAlert className="size-4" aria-hidden />Before you start</h2>
            <div className="[&_dl]:divide-amber-200 [&_dt]:text-amber-900">
              <Dl rows={[["Access", v.property.accessNotes], ["Gate code", v.property.gateCode], ["Pets", v.property.petNotes], ["Watch out", v.property.hazards], ["Site", siteFacts(v.property)], ["Instructions", v.instructions ?? v.job.instructions]]} />
            </div>
          </section>
        )}

        {v.isReturn && (
          <div className="[&>p]:mb-0">
            <Notice><span className="font-semibold">Return visit.</span> <span className="font-normal">We&apos;ve already cleared this address this storm; this trip is for what came back (usually the city plough at the driveway end). {v.returnPriceCents ? <>Billable: <span className="font-semibold tabular-nums">{cad(v.returnPriceCents)}</span>, charged once when it&apos;s marked done.</> : "Included: no charge."}</span></Notice>
          </div>
        )}
        {v.extras.length > 0 && (
          <Card title="Extras the client added">
            <ul className="divide-y divide-line-soft text-sm">{v.extras.map((e) => <li key={e.id} className="flex justify-between gap-2 py-2"><span className="font-semibold">{e.name}</span><span className="tabular-nums text-ink-soft">{cad(e.unitPriceCents)}</span></li>)}</ul>
            <p className="mt-2 text-xs text-ink-soft">Added from their client page. Billed once, with this visit, when it&apos;s marked done.</p>
          </Card>
        )}

        <VisitChecklistCard businessId={v.businessId} visitId={v.id} editable={v.state !== "CANCELLED"} />
        {(v.job.requireSignature || v.state === "COMPLETED") && <SignatureCard where={{ visitId: v.id }} signHref={`/sign/visit/${v.id}`} title={v.job.requireSignature ? "Client signature (needed before Done)" : "Client signature"} />}

        <Card title="Before and after photos">
          <div className="grid grid-cols-2 gap-2">
            <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "BEFORE" }} label="Before" geo />
            <PhotoUploader endpoint="/api/uploads" fields={{ visitId: v.id, kind: "AFTER" }} label="After" geo />
          </div>
          {v.attachments.length > 0 && <div className="mt-3"><Gallery photos={v.attachments} back={here} /></div>}
          {v.state === "COMPLETED" && !v.attachments.some((a) => a.kind === "AFTER") && <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />No after photo yet. The client&apos;s &quot;all done&quot; email goes out 5 minutes after Done, so add one now.</p>}
        </Card>

        <Card title="Time">
          <VisitTimer visitId={v.id} runningSince={running?.visitId === v.id ? running.startedAt.toISOString() : null} back={`/visits/${v.id}`} />
          {running && running.visitId !== v.id && <p className="mt-2 text-xs text-ink-soft">{running.visitId ? "Your timer is running on another visit. Starting here stops that one." : "You're on the day clock. Starting here pauses it until you stop this timer."}</p>}
          {visitTime.length > 0 && <p className="mt-3 text-sm tabular-nums text-ink-soft">Logged: {visitTime.map((t) => `${personName(t.user)} ${hm(t.minutes ?? 0)}`).join(" · ")}</p>}
          {(took != null || usual != null) && <p className="mt-2 text-sm tabular-nums">{v.state === "COMPLETED" && took != null ? <>Took <span className="font-semibold">{took} min</span> on site{usual != null && ` (usually ${usual})`}.</> : usual != null ? `This address usually takes ${usual} min.` : null}</p>}
        </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
        {open ? (
          <>
            <Card title="Do the visit">
              <ol className="space-y-4">
                <li className="flex items-center gap-3">
                  {step(1, v.state !== "SCHEDULED")}
                  {v.state === "SCHEDULED"
                    ? <form action={visitTransition} className="flex-1">{hidden("EN_ROUTE")}<Button variant="secondary" className={big}>On my way</Button></form>
                    : <span className="text-sm font-medium text-ink-soft">On my way</span>}
                </li>
                <li className="flex items-center gap-3">
                  {step(2, v.state === "IN_PROGRESS")}
                  {v.state !== "IN_PROGRESS"
                    ? <form action={visitTransition} className="flex-1">{hidden("IN_PROGRESS")}<Button variant="secondary" className={big}>Arrived</Button></form>
                    : <span className="text-sm font-medium text-ink-soft">Arrived</span>}
                </li>
                <li className="flex items-start gap-3">
                  <span className="pt-3.5">{step(3, false)}</span>
                  <form action={visitTransition} className="flex-1 space-y-3">
                    {hidden("COMPLETED")}<GeoFields />
                    <Field label="Snow depth (cm, optional)">
                      <Input name="depthCm" type="number" inputMode="numeric" min={0} max={300} defaultValue={v.depthCm ?? v.snowEvent?.measuredCm ?? ""} />
                    </Field>
                    {hasIceMelt && (
                      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                        <input type="hidden" name="iceMeltShown" value="1" />
                        <input type="checkbox" name="iceMeltApplied" defaultChecked={v.iceMeltApplied ?? true} className="size-6" /> Ice melt put down
                      </label>
                    )}
                    {hasIceMelt && (
                      <Field label="Bags of ice melt used (optional)">
                        <Input name="iceMeltBags" type="number" inputMode="decimal" min={0} max={999} step="0.01" defaultValue={v.iceMeltBags != null ? Number(v.iceMeltBags) : ""} />
                      </Field>
                    )}
                    <Button className={big}><Check className="size-5" aria-hidden />Mark done</Button>
                  </form>
                </li>
              </ol>
            </Card>
            <section className="divide-y divide-line-soft rounded-xl border border-line bg-white shadow-card" aria-label="Skip or cancel">
              <details className="p-4 sm:px-5">
                <summary className="flex min-h-8 max-sm:min-h-11 items-center text-sm font-semibold">Couldn&apos;t do it</summary>
                <form action={visitTransition} className="mt-3 space-y-3">
                  {hidden("SKIPPED")}
                  <Field label="Reason"><select name="skipReason" className={inputCls} defaultValue="ALREADY_CLEARED">{SKIP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                  <Input name="skipNote" placeholder="Note (optional)" aria-label="Note (optional)" maxLength={500} />
                  <Button variant="secondary" className="min-h-11! w-full">Skip this visit</Button>
                </form>
              </details>
              {canTransition(v.state, "CANCELLED") && (
                <form action={visitTransition} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">{hidden("CANCELLED")}
                  <p className="min-w-0 flex-1 basis-48 text-xs text-ink-soft">Cancelling takes it off the schedule and sends nothing to the client. You can un-cancel it later.</p>
                  <ConfirmButton message="Cancel this visit? It comes off the schedule and nothing is sent to the client. You can un-cancel it later." className={btn("danger")}>Cancel visit</ConfirmButton>
                </form>
              )}
            </section>
          </>
        ) : (
          <Card title={v.state === "COMPLETED" ? "Done" : v.state === "SKIPPED" ? "Skipped" : "Cancelled"}>
            <Dl rows={[
              ["When", prettyDateTime(v.completedAt ?? v.skippedAt)],
              ["Depth", v.depthCm != null ? `${v.depthCm} cm` : null],
              ["Ice melt", v.state === "COMPLETED" && v.iceMeltApplied ? `Yes${v.iceMeltBags != null ? ` · ${Number(v.iceMeltBags)} bag${Number(v.iceMeltBags) === 1 ? "" : "s"}` : ""}` : null],
              ["Time on site", v.state === "COMPLETED" && took != null ? `${took} min${usual != null ? ` (usually ${usual})` : ""}` : null],
              ["Reason", v.skipReason ? skipLabel(v.skipReason) : null],
              ["Note", v.skipNote],
              ["Location", v.completedLat != null ? <a className="font-semibold text-blue hover:text-blue-deep" href={`https://www.google.com/maps/search/?api=1&query=${v.completedLat},${v.completedLng}`}>Recorded</a> : null],
              ["Charges", v.charges.length ? v.charges.map((c) => `${c.name}: ${cad(c.totalCents)}`).join("\n") : null],
            ]} />
            {v.state === "COMPLETED" && v.iceMeltApplied && (
              <form action={visitIceMeltBags} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                <label className="text-sm font-semibold">Bags of ice melt used<input name="bags" type="number" inputMode="decimal" min={0} max={999} step="0.01" defaultValue={v.iceMeltBags != null ? Number(v.iceMeltBags) : ""} className={`${inputCls} mt-1 w-32`} /></label>
                <Button variant="secondary">Save</Button>
              </form>
            )}
            {returnCents != null && (
              <form action={visitReturn} className="mt-4 space-y-2 rounded-lg bg-tint p-3">
                <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                <p className="text-sm"><span className="font-semibold">Plough came back?</span> Add a return visit to today&apos;s route for this address, with the same people.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" name="billable" value="0" className="min-h-11!">Included (no charge)</Button>
                  <Button variant="secondary" name="billable" value="1" className="min-h-11! tabular-nums">Billable ({cad(returnCents)})</Button>
                </div>
              </form>
            )}
            {invoice && owing > 0 && (
              <form action={paymentRecord} className="mt-4 space-y-2 rounded-lg bg-tint p-3">
                <input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="back" value={here} />
                <input type="hidden" name="amount" value={(owing / 100).toFixed(2)} />
                <p className="text-sm">Invoice #{invoice.number}: <span className="font-semibold tabular-nums">{cad(owing)}</span> owing. Paid on the spot?</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" name="method" value="CASH" className="min-h-11!">Got cash</Button>
                  <Button variant="secondary" name="method" value="ETRANSFER" className="min-h-11!">Got e-Transfer</Button>
                </div>
              </form>
            )}
            {invoice && owing <= 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Check className="size-4" aria-hidden />Invoice #{invoice.number} paid</p>}
            {!invoice?.id && v.charges.some((c) => c.invoiceLineItemId) && <p className="mt-3 text-sm text-ink-soft">Invoiced.</p>}
            {!v.charges.some((c) => c.invoiceLineItemId)
              ? <form action={visitTransition} className="mt-4 border-t border-line-soft pt-4">{hidden("SCHEDULED")}<Button variant="secondary">{v.state === "CANCELLED" ? "Un-cancel" : "Reopen"}</Button></form>
              : <p className="mt-3 text-xs text-ink-soft">This visit is on an invoice, so it can&apos;t be reopened.</p>}
          </Card>
        )}

        {v.job.kind !== "SNOW_PLAN" && v.job.billingType === "PER_VISIT" && (
          <Card title={overrides ? "This visit's own price" : "What this visit charges"}>
            <ul className="divide-y divide-line-soft text-sm">
              {priced.map((l, i) => <li key={i} className="flex justify-between gap-2 py-2"><span>{l.name}{Number(l.quantity) !== 1 && <span className="tabular-nums text-ink-soft"> × {Number(l.quantity)}</span>}</span><span className="font-semibold tabular-nums">{cad(Math.round(Number(l.quantity) * l.unitPriceCents))}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">{overrides ? `Changed for this visit only; job #${v.job.number} keeps its own prices.` : "From the job's line items."}{linesLock && ` ${linesLock}.`}</p>
            {!linesLock && (
              <details className="mt-3">
                <summary className="text-sm font-semibold text-blue hover:text-blue-deep">Change for this visit only</summary>
                <form action={visitLinesSet} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                  <LineItems services={services.map((s) => ({ id: s.id, name: s.name, description: s.description, unitPriceCents: s.unitPriceCents }))} label="Charged when this visit is done"
                    initial={priced.map((l) => ({ name: l.name, desc: l.description ?? "", qty: String(Number(l.quantity)), price: String(l.unitPriceCents / 100) }))} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary">Save for this visit</Button>
                    {overrides && <Button variant="secondary" name="clear" value="1">Back to the job&apos;s prices</Button>}
                  </div>
                </form>
              </details>
            )}
          </Card>
        )}

        <Card title="Who's on it">
          {people.length ? (
            <form action={assignPeople} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <input type="hidden" name="kind" value="visit" /><input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={`/visits/${v.id}`} />
              {people.map((p) => <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="userId" value={p.id} defaultChecked={v.assignees.some((a) => a.userId === p.id)} className="size-5" /><span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</label>)}
              <Button variant="secondary" className="ml-auto">Save</Button>
            </form>
          ) : <p className="text-sm text-ink-soft">Nobody on the team yet.</p>}
        </Card>

        <div className="flex flex-wrap gap-2">
          {nextStop && <ButtonLink href={`/visits/${nextStop}`} variant={open ? "secondary" : "primary"} className="min-h-12! flex-1 whitespace-nowrap">Next stop<ChevronRight className="size-4" aria-hidden /></ButtonLink>}
          <ButtonLink href={`/jobs/${v.jobId}`} className="min-h-12! flex-1 whitespace-nowrap">Job #{v.job.number}</ButtonLink>
          {v.snowEventId && <ButtonLink href={`/routes?storm=${v.snowEventId}`} className="min-h-12! flex-1 whitespace-nowrap">Route</ButtonLink>}
        </div>
        </div>
      </div>
    </div>
  );
}
