// Client hub: upcoming & past visits (with photos), quotes, invoices, snow plan pause and add-ons, extras on a visit,
// ordering more work (./order).
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { extrasOffered } from "@/server/billing/charges";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { signedMediaPath } from "@/server/media";
import { money } from "@/server/money";
import { mintToken, peekToken } from "@/server/tokens";
import { currentCharge, snowPrices } from "@/server/ops/drive-size";
import { renewalSeason } from "@/server/ops/jobs";
import { addOnServices } from "@/server/ops/visits";
import { stripeEnabled } from "@/server/stripe";
import { referralCodeFor, referralLink } from "@/server/ops/marketing";
import { parseSettings } from "@/server/settings";
import { hubPausePlan, hubPayAll, hubPlanAddOn, hubRenewPlan, hubRequestWork, hubSetTexts, hubVisitExtra } from "./actions";

export const metadata = { title: { absolute: "Your etc. page" } };

export default async function Hub({ params, searchParams }: PageProps<"/hub/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) {
    return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft"><Link className="font-semibold text-blue" href="/hub">Get a new link by email</Link>.</p></Card>;
  }
  const c = await db.client.findUniqueOrThrow({ where: { id: t.token.clientId } });
  const today = todayLocal();
  const [visits, quotes, invoices, plans] = await Promise.all([
    db.visit.findMany({
      where: { job: { clientId: c.id }, state: { not: "CANCELLED" } }, orderBy: [{ scheduledDate: { sort: "desc", nulls: "first" } }], take: 30,
      include: { job: { include: { lineItems: true } }, property: true, extras: { orderBy: { createdAt: "asc" } }, attachments: { where: { deletedAt: null, sharedWithClient: true }, orderBy: { createdAt: "asc" }, take: 4 } },
    }),
    db.quote.findMany({ where: { clientId: c.id, status: { in: ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED"] } }, orderBy: { number: "desc" } }),
    db.invoice.findMany({ where: { clientId: c.id, status: { in: ["AWAITING_PAYMENT", "PAID"] } }, orderBy: { number: "desc" } }),
    db.job.findMany({ where: { clientId: c.id, kind: "SNOW_PLAN", closedAt: null }, include: { property: true, season: true, lineItems: true } }),
  ]);
  // Add-ons and their prices, straight from the price book.
  const [addOns, prices] = await Promise.all([addOnServices(c.businessId), snowPrices(db, c.businessId)]);
  const iceMeltCents = addOns.find((a) => a.key === "ice_melt")?.unitPriceCents ?? 500;
  const refCode = await referralCodeFor(c.id);
  const refReward = parseSettings((await db.business.findUniqueOrThrow({ where: { id: c.businessId } })).settings).referralRewardCents;
  const creditLeft = (await db.clientCredit.aggregate({ where: { clientId: c.id, appliedToInvoiceId: null }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  const payments = await db.payment.findMany({ where: { clientId: c.id }, include: { invoice: { select: { number: true } } }, orderBy: { receivedAt: "desc" }, take: 20 });
  // Fresh scoped links for each quote / invoice / visit report.
  const link = async (purpose: "QUOTE" | "INVOICE" | "VISIT_REPORT", ref: Record<string, string>) => mintToken(db, c.businessId, purpose, { clientId: c.id, ...ref });
  const upcoming = visits.filter((v) => v.state !== "COMPLETED" && v.state !== "SKIPPED").reverse();
  const past = visits.filter((v) => v.state === "COMPLETED").slice(0, 10);
  const quoteLinks = await Promise.all(quotes.map((q) => link("QUOTE", { quoteId: q.id })));
  const invoiceLinks = await Promise.all(invoices.map((i) => link("INVOICE", { invoiceId: i.id })));
  const reportLinks = await Promise.all(past.map((v) => link("VISIT_REPORT", { visitId: v.id })));
  const renewTo = await renewalSeason(c.businessId);
  const hadPlan = await db.job.count({ where: { clientId: c.id, kind: "SNOW_PLAN" } });
  const canRenew = !!renewTo && hadPlan > 0 && !plans.some((p) => p.seasonId === renewTo.id);
  const owing = invoices.filter((i) => i.status === "AWAITING_PAYMENT").reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0);
  const hidden = <input type="hidden" name="t" value={token} />;
  return (
    <div className="space-y-4">
      {sp.plan && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Your snow plan is {String(sp.plan)}. We&apos;ve let Silas know.</p>}
      {sp.requested && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Thanks! We got your request and will be in touch.</p>}
      {sp.addon && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Done: {String(sp.addon)}, starting with your next clearing. We&apos;ve let Silas know.</p>}
      {sp.extra && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">{String(sp.extra)}. We&apos;ve let Silas know.</p>}
      {sp.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{String(sp.error)}</p>}
      <h1 className="font-display text-3xl font-bold">Hi {c.firstName}!</h1>
      {sp.paid && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Payment received. Thank you!</p>}
      {owing > 0 && (
        <Card className="border-blue/30">
          <p className="font-semibold">{money(owing)} owing.{stripeEnabled() ? "" : " Pay from an invoice below."}</p>
          {stripeEnabled() && <form action={hubPayAll} className="mt-2"><input type="hidden" name="t" value={token} /><button className="min-h-12 rounded-full bg-blue px-6 font-semibold text-white">Pay {money(owing)} by card</button></form>}
        </Card>
      )}
      <Card title="Need something done?">
        <p className="text-sm">Pick a service, the address and a time that works. Same prices as our booking page; pay after the job.</p>
        <a href={`/hub/${token}/order`} className="mt-3 flex min-h-12 items-center justify-center rounded-full bg-blue px-6 font-semibold text-white">Book a service</a>
        <details className="mt-3">
          <summary className="cursor-pointer py-1 text-sm font-semibold text-blue">Not on the list? Just tell us</summary>
          <form action={hubRequestWork} className="mt-2 space-y-3">{hidden}
            <textarea name="notes" rows={3} required maxLength={2000} placeholder="e.g. Could you clean out the gutters and power wash the deck in spring?" className="w-full rounded-xl border border-line p-3" />
            <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">Send request</button>
          </form>
        </details>
      </Card>
      <Card title="Send a neighbour our way">
        <p className="text-sm">Share your link. When they book and pay their first invoice, you get {money(refReward)} off your next one.</p>
        <p className="mt-2 select-all break-all rounded-lg bg-tint p-2 text-sm font-semibold">{referralLink(refCode)}</p>
        {creditLeft > 0 && <p className="mt-2 text-sm font-semibold text-emerald-700">You have {money(creditLeft)} in credit for your next invoice.</p>}
      </Card>
      <Card title="Payment history" actions={<a href={`/hub/${token}/statement`} className="text-sm font-semibold text-blue">Statement</a>}>
        {payments.length ? (
          <ul className="divide-y divide-line text-sm">{payments.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.receivedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", year: "numeric" })} · {p.method === "ETRANSFER" ? "e-Transfer" : p.method.charAt(0) + p.method.slice(1).toLowerCase()} · invoice #{p.invoice.number}</span><span className="font-semibold">{money(p.amountCents - p.refundedCents)}</span></li>)}</ul>
        ) : <p className="text-sm text-ink-soft">No payments yet.</p>}
      </Card>

      {sp.texts && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Text updates {sp.texts === "on" ? "turned on" : "turned off"}.</p>}
      {sp.renewed && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">You&apos;re renewed. See you after the next snowfall!</p>}
      {canRenew && (
        <Card title={`Renew your snow plan for ${renewTo!.name}?`} className="border-blue/30">
          <p className="text-sm">Same address, same price per clearing. Nothing to pay now.</p>
          <form action={hubRenewPlan} className="mt-3">{hidden}<button className="min-h-12 rounded-full bg-blue px-6 font-semibold text-white">Renew my plan</button></form>
        </Card>
      )}
      {plans.map((p) => {
        const walk = currentCharge(p.lineItems).walk;
        const per = p.snowBillingMode === "PER_EVENT" ? "per storm" : "per clearing";
        return (
        <Card key={p.id} title="Every-snowfall plan">
          <p className="text-sm">{p.property.formatted} · {p.season?.name} · we come when {p.triggerCm ?? p.season?.defaultTriggerCm ?? 2} cm or more falls · {money(p.pricePerPushCents ?? 3000)} per clearing{p.iceMelt ? " + ice melt" : ""}{walk ? " + extra sidewalk" : ""}.</p>
          {/* Add-ons are charged with each clearing, so not on a season-price plan, and not while a new price is waiting for an OK. */}
          {!p.sizeHoldAt && p.snowBillingMode !== "SEASONAL" && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {([["iceMelt", "Ice melt", p.iceMelt, iceMeltCents], ["extraWalk", "Extra sidewalk (corner lot or long walk)", walk > 0, walk || prices.walk]] as const).map(([key, label, on, cents]) => (
                <li key={key} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span><b>{label}</b><span className="block text-ink-soft">{on ? "On · " : "+"}{money(cents)} {per}</span></span>
                  <form action={hubPlanAddOn}>{hidden}<input type="hidden" name="jobId" value={p.id} /><input type="hidden" name="addon" value={key} /><input type="hidden" name="on" value={on ? "0" : "1"} />
                    <button className={`min-h-11 rounded-full px-5 font-semibold ${on ? "border-2 border-line bg-white" : "bg-blue text-white"}`}>{on ? "Turn off" : "Add"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={hubPausePlan} className="mt-3">{hidden}<input type="hidden" name="jobId" value={p.id} /><input type="hidden" name="pause" value={p.planPausedAt ? "0" : "1"} />
            {p.planPausedAt
              ? <><Badge tone="amber">Paused</Badge> <button className="ml-2 min-h-11 rounded-full bg-blue px-5 font-semibold text-white">Resume my plan</button></>
              : <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">Pause (I&apos;m away)</button>}
          </form>
        </Card>
        );
      })}

      <Card title="Upcoming">
        {upcoming.length ? (
          <ul className="divide-y divide-line">{upcoming.map((v) => {
            // Extras only while the visit hasn't started, and only ones this job doesn't already charge.
            const open = v.state === "SCHEDULED" && !v.job.closedAt && !v.job.sizeHoldAt;
            const offer = open ? extrasOffered(addOns, v.job, v.extras) : [];
            return (
              <li key={v.id} className="py-2.5 text-sm"><b>{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Date to be confirmed"}</b> · {v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title} · {v.property.formatted}
                {v.extras.map((e) => (
                  <form key={e.id} action={hubVisitExtra} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-tint px-3 py-1">{hidden}<input type="hidden" name="removeId" value={e.id} />
                    <span>+ {e.name} · {money(e.unitPriceCents)}</span>
                    {open && <button className="min-h-11 flex-none font-semibold text-blue">Remove</button>}
                  </form>
                ))}
                {offer.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer py-2 font-semibold text-blue">Add an extra to this visit</summary>
                    <div className="space-y-2">{offer.map((a) => (
                      <form key={a.id} action={hubVisitExtra} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">{hidden}<input type="hidden" name="visitId" value={v.id} /><input type="hidden" name="serviceId" value={a.id} />
                        <span><b>{a.name}</b>{a.description && <span className="block text-ink-soft">{a.description}</span>}</span>
                        <button className="min-h-11 flex-none rounded-full bg-blue px-4 font-semibold text-white">Add · {money(a.unitPriceCents!)}</button>
                      </form>
                    ))}</div>
                  </details>
                )}
              </li>
            );
          })}</ul>
        ) : <p className="text-sm text-ink-soft">Nothing booked{plans.length ? "; we'll come when it snows" : ""}.</p>}
      </Card>

      {past.length > 0 && (
        <Card title="Recent visits">
          <ul className="divide-y divide-line">
            {past.map((v, i) => (
              <li key={v.id} className="py-3">
                <a href={`/v/${reportLinks[i]}`} className="font-semibold text-blue">{prettyDate(dateOnly(v.scheduledDate))} · {v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title}</a>
                {v.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private media via signed URL */}
                    {v.attachments.map((a) => <img key={a.id} src={signedMediaPath(a.id, "sm", 7)} alt={a.kind} className="h-16 w-20 rounded-lg object-cover" />)}
                  </div>
                )}
                {v.job.kind === "ONE_OFF" && past.findIndex((x) => x.jobId === v.jobId) === i && (
                  <a href={`/hub/${token}/order?again=${v.jobId}`} className="mt-2 flex min-h-11 w-fit items-center rounded-full border-2 border-line px-5 text-sm font-semibold">Book this again</a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {quotes.length > 0 && (
        <Card title="Quotes">
          <ul className="divide-y divide-line">{quotes.map((q, i) => (
            <li key={q.id}><a href={`/q/${quoteLinks[i]}`} className="flex justify-between gap-2 py-2.5 text-sm"><span className="font-semibold text-blue">#{q.number} {q.title}</span><span>{money(q.totalCents)} · {q.status === "AWAITING_RESPONSE" ? "Waiting for you" : q.status === "CHANGES_REQUESTED" ? "Being updated" : "Approved"}</span></a></li>
          ))}</ul>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card title="Invoices">
          <ul className="divide-y divide-line">{invoices.map((inv, i) => {
            const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, today);
            return <li key={inv.id}><a href={`/i/${invoiceLinks[i]}`} className="flex justify-between gap-2 py-2.5 text-sm"><span className="font-semibold text-blue">#{inv.number} {inv.subject}</span><span>{money(inv.totalCents)} · {view === "PAID" ? "Paid" : view === "PAST_DUE" ? "Past due" : "Pay now"}</span></a></li>;
          })}</ul>
        </Card>
      )}

      {c.phone && (
        <Card title="Text updates">
          <p className="text-sm">{c.smsOptIn ? `We text ${c.phone} when we're on the way and when the job's done.` : `Want a text at ${c.phone} when we're on the way and when the job's done?`}</p>
          <form action={hubSetTexts} className="mt-3">{hidden}<input type="hidden" name="on" value={c.smsOptIn ? "0" : "1"} />
            <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">{c.smsOptIn ? "Stop texts" : "Yes, text me"}</button>
          </form>
        </Card>
      )}
      <p className="text-center text-sm text-ink-soft">Questions? Call {env.phone} or email {env.helpEmail}. This page is private to you.</p>
    </div>
  );
}
