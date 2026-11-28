// Client hub: upcoming & past visits (with photos), quotes, invoices, snow plan pause and add-ons, extras on a visit,
// ordering more work (./order).
// Ordered by what a client most often opens it for: what they owe, what is waiting on them, what is coming up, their
// snow plan, booking more; then the record (past work, invoices, payments) and the settings (card, texts, referral).
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyField } from "@/components/public/copy-field";
import { cta, Help, LinkProblem, PageTitle, tap, Tap, textLink, TickRow } from "@/components/public/kit";
import { Badge, Card, inputCls, Notice } from "@/components/ui";
import { extrasOffered } from "@/server/billing/charges";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { signedMediaPath } from "@/server/media";
import { cad, money } from "@/server/money";
import { mintToken, peekToken } from "@/server/tokens";
import { currentCharge, snowPrices } from "@/server/ops/drive-size";
import { renewalSeason } from "@/server/ops/jobs";
import { addOnServices } from "@/server/ops/visits";
import { stripeEnabled } from "@/server/stripe";
import { referralCodeFor, referralLink } from "@/server/ops/marketing";
import { parseSettings } from "@/server/settings";
import { describeTiers, parseTiers } from "@/server/snow/tiers";
import { autoPayPending, cardLabel } from "@/server/billing/autopay";
import { hubPausePlan, hubPayAll, hubPlanAddOn, hubRemoveCard, hubRenewPlan, hubRequestWork, hubSaveCard, hubSetAutoPay, hubSetTexts, hubVisitExtra } from "./actions";

export const metadata = { title: { absolute: "Your etc. page" } };

/** A list row that is one big link: what it is on the left, the figure and state on the right. */
const rowLink = "flex min-h-[52px] items-center justify-between gap-3 py-2.5 hover:text-blue";

export default async function Hub({ params, searchParams }: PageProps<"/hub/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["CLIENT_HUB"]);
  if (!t.ok || !t.token.clientId) {
    return <LinkProblem title="This link has expired"><Link className={textLink} href="/hub">Get a new link by email</Link></LinkProblem>;
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
  const settings = parseSettings((await db.business.findUniqueOrThrow({ where: { id: c.businessId } })).settings);
  const refReward = settings.referralRewardCents;
  const cards = stripeEnabled() && settings.autoPay, card = cardLabel(c); // saved cards are optional: only with Stripe keys and the business switch on
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
  const lastPlan = await db.job.findFirst({ where: { clientId: c.id, kind: "SNOW_PLAN" }, orderBy: { createdAt: "desc" } }); // the one renewPlan copies
  const canRenew = !!renewTo && !!lastPlan && !plans.some((p) => p.seasonId === renewTo.id);
  const owing = invoices.filter((i) => i.status === "AWAITING_PAYMENT").reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0);
  const hidden = <input type="hidden" name="t" value={token} />;
  const unpaid = invoices.map((inv, i) => ({ inv, href: `/i/${invoiceLinks[i]}` })).filter(({ inv }) => inv.status === "AWAITING_PAYMENT");
  const payHere = owing > 0 && stripeEnabled(); // then paying is the page's main action, and "Book a service" steps back
  const waiting = quotes.some((q) => q.status === "AWAITING_RESPONSE");
  const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" });

  const quotesCard = quotes.length > 0 && (
    <Card title="Quotes">
      <ul className="-my-2 divide-y divide-line-soft">{quotes.map((q, i) => (
        <li key={q.id}><a href={`/q/${quoteLinks[i]}`} className={rowLink}>
          <span className="min-w-0"><span className="block font-semibold">{q.title}</span><span className="block text-sm text-ink-soft tabular-nums">Quote #{q.number} · {money(q.totalCents)}</span></span>
          <span className="flex shrink-0 items-center gap-1.5">{q.status === "AWAITING_RESPONSE" ? <Badge tone="amber">Waiting for you</Badge> : q.status === "CHANGES_REQUESTED" ? <Badge tone="gray">Being updated</Badge> : <Badge tone="green">Approved</Badge>}<ChevronRight className="size-4 text-ink-faint" strokeWidth={1.75} aria-hidden /></span>
        </a></li>
      ))}</ul>
    </Card>
  );

  return (
    <>
      {sp.plan && <Notice tone="good">Your snow plan is {String(sp.plan)}. We&apos;ve let Silas know.</Notice>}
      {sp.requested && <Notice tone="good">Thanks. We got your request and will be in touch.</Notice>}
      {sp.addon && <Notice tone="good">Done: {String(sp.addon)}, starting with your next clearing. We&apos;ve let Silas know.</Notice>}
      {sp.extra && <Notice tone="good">{String(sp.extra)}. We&apos;ve let Silas know.</Notice>}
      {sp.paid && <Notice tone="good">Payment received. Thank you.</Notice>}
      {sp.card && <Notice tone="good">{sp.card === "saved" ? "Thanks. Your card is being saved. It will show here in a moment." : "Your card has been removed."}</Notice>}
      {sp.autopay && <Notice tone="good">Automatic payments are {c.autoPayConsentAt ? "on" : "off"}.</Notice>}
      {sp.texts && <Notice tone="good">Text updates {sp.texts === "on" ? "turned on" : "turned off"}.</Notice>}
      {sp.renewed && <Notice tone="good">You&apos;re renewed. See you after the next snowfall.</Notice>}
      {sp.error && <Notice tone="bad">{String(sp.error)}</Notice>}
      <PageTitle title={`Hi ${c.firstName}`} sub="Your visits, quotes and invoices, all in one place. This page is private to you." />
      <div className="grid gap-5">
        {owing > 0 && (
          <Card title="What you owe">
            <p className="font-display text-[2.25rem] font-semibold leading-none tabular-nums">{cad(owing)}</p>
            <ul className="mt-3 divide-y divide-line-soft border-t border-line-soft">{unpaid.map(({ inv, href }) => {
              const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, today);
              return (
                <li key={inv.id}><a href={href} className={rowLink}>
                  <span className="min-w-0"><span className="block font-semibold">{inv.subject}</span>
                    <span className={`block text-sm tabular-nums ${view === "PAST_DUE" ? "font-medium text-red-700" : "text-ink-soft"}`}>Invoice #{inv.number} · {autoPayPending(inv.autoPayState) && inv.autoPayOn ? `card ${inv.autoPayState === "RETRYING" ? "tried again" : "charged"} ${prettyDate(dateOnly(inv.autoPayOn))}` : view === "PAST_DUE" ? `past due, was due ${prettyDate(dateOnly(inv.dueOn))}` : `due ${prettyDate(dateOnly(inv.dueOn))}`}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5"><span className="font-semibold tabular-nums">{cad(inv.totalCents - inv.amountPaidCents)}</span><span className="font-semibold text-blue">Pay</span><ChevronRight className="size-4 text-ink-faint" strokeWidth={1.75} aria-hidden /></span>
                </a></li>
              );
            })}</ul>
            {stripeEnabled()
              ? <form action={hubPayAll} className="mt-3"><input type="hidden" name="t" value={token} /><button className={cta()}>Pay {cad(owing)} by card</button></form>
              : <p className="mt-3 text-sm text-ink-soft">Open an invoice to see how to pay it.</p>}
          </Card>
        )}
        {waiting && quotesCard}
        <Card title="Coming up">
          {upcoming.length ? (
            <ul className="-my-3 divide-y divide-line-soft">{upcoming.map((v) => {
              // Extras only while the visit hasn't started, and only ones this job doesn't already charge.
              const open = v.state === "SCHEDULED" && !v.job.closedAt && !v.job.sizeHoldAt;
              const offer = open ? extrasOffered(addOns, v.job, v.extras) : [];
              return (
                <li key={v.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 size-[18px] shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold tabular-nums">{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Date to be confirmed"}{v.scheduledDate && v.startAt && !v.anytime && ` at ${time(v.startAt)}`}</p>
                      <p className="text-ink-soft">{v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title} · {v.property.formatted}</p>
                    </div>
                  </div>
                  {v.extras.map((e) => (
                    <form key={e.id} action={hubVisitExtra} className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-tint px-3.5">{hidden}<input type="hidden" name="removeId" value={e.id} />
                      <span className="tabular-nums">+ {e.name} · {money(e.unitPriceCents)}</span>
                      {open && <button className="min-h-11 flex-none font-semibold text-blue hover:text-blue-deep" aria-label={`Remove ${e.name}`}>Remove</button>}
                    </form>
                  ))}
                  {offer.length > 0 && (
                    <details className="mt-1">
                      <summary className="py-2.5 font-semibold text-blue">Add an extra to this visit</summary>
                      <ul className="divide-y divide-line-soft rounded-lg border border-line">{offer.map((a) => (
                        <li key={a.id}><form action={hubVisitExtra} className="flex items-center justify-between gap-3 p-3">{hidden}<input type="hidden" name="visitId" value={v.id} /><input type="hidden" name="serviceId" value={a.id} />
                          <span className="min-w-0"><span className="block font-semibold">{a.name}</span>{a.description && <span className="block text-sm text-ink-soft">{a.description}</span>}</span>
                          <Tap className="flex-none tabular-nums">Add · {money(a.unitPriceCents!)}</Tap>
                        </form></li>
                      ))}</ul>
                    </details>
                  )}
                </li>
              );
            })}</ul>
          ) : <p className="text-ink-soft">Nothing booked{plans.length ? "; we&apos;ll come when it snows" : " right now. When you need us, book a service below"}.</p>}
        </Card>
        {canRenew && (
          <Card title={`Renew your snow plan for ${renewTo!.name}?`}>
            <p>{lastPlan!.snowBillingMode === "SEASONAL"
              ? `Same address, same ${money(lastPlan!.seasonalPriceCents ?? 0)} season price. We'll send the invoice when the season starts.`
              : parseTiers(lastPlan!.depthTiers).length ? `Same address, same prices: from ${money(lastPlan!.pricePerPushCents ?? 3000)} per clearing (${describeTiers(parseTiers(lastPlan!.depthTiers), lastPlan!.pricePerPushCents ?? 3000, money)}). Nothing to pay now.`
              : "Same address, same price per clearing. Nothing to pay now."}</p>
            <form action={hubRenewPlan} className="mt-3">{hidden}<Tap className="w-full sm:w-auto">Renew my plan</Tap></form>
          </Card>
        )}
        {plans.map((p) => {
          const walk = currentCharge(p.lineItems).walk;
          const per = p.snowBillingMode === "PER_EVENT" ? "per storm" : "per clearing";
          const tiers = p.snowBillingMode === "SEASONAL" ? [] : parseTiers(p.depthTiers);
          return (
          <Card key={p.id} title="Every-snowfall plan" actions={p.planPausedAt ? <Badge tone="amber">Paused</Badge> : <Badge tone="green">Active</Badge>}>
            <p>{p.property.formatted} · {p.season?.name} · we come when {p.triggerCm ?? p.season?.defaultTriggerCm ?? 2} cm or more falls · {p.snowBillingMode === "SEASONAL"
              ? `${money(p.seasonalPriceCents ?? 0)} for the season${p.iceMelt ? (p.addonsIncluded ? ", ice melt included" : " + ice melt") : ""}`
              : `${tiers.length ? "from " : ""}${money(p.pricePerPushCents ?? 3000)} per ${p.snowBillingMode === "PER_EVENT" ? "storm" : "clearing"}${p.iceMelt ? " + ice melt" : ""}${walk ? " + extra sidewalk" : ""}`}.</p>
            {tiers.length > 0 && <p className="mt-1 text-sm text-ink-soft">By snow depth: {describeTiers(tiers, p.pricePerPushCents ?? 3000, money)}.</p>}
            {/* Add-ons are charged with each clearing, so not on a season-price plan, and not while a new price is waiting for an OK. */}
            {!p.sizeHoldAt && p.snowBillingMode !== "SEASONAL" && (
              <>
                <h3 className="mt-4 text-sm font-medium text-ink-soft">Add-ons</h3>
                <ul className="mt-1 divide-y divide-line-soft border-y border-line-soft">
                  {([["iceMelt", "Ice melt", p.iceMelt, iceMeltCents], ["extraWalk", "Extra sidewalk (corner lot or long walk)", walk > 0, walk || prices.walk]] as const).map(([key, label, on, cents]) => (
                    <li key={key}>
                      <form action={hubPlanAddOn} className="flex items-center justify-between gap-3 py-2">{hidden}<input type="hidden" name="jobId" value={p.id} /><input type="hidden" name="addon" value={key} /><input type="hidden" name="on" value={on ? "0" : "1"} />
                        <span className="min-w-0"><span className="block font-semibold">{label}</span><span className="block text-sm text-ink-soft tabular-nums">{on ? "On · " : "+"}{money(cents)} {per}</span></span>
                        <button role="switch" aria-checked={on} aria-label={`${label}: ${on ? "on, tap to turn off" : "off, tap to add"}`} className="group flex min-h-11 shrink-0 items-center gap-2 rounded-lg pl-2 font-semibold">
                          <span className={`w-7 text-right text-sm ${on ? "text-navy" : "text-ink-soft"}`}>{on ? "On" : "Off"}</span>
                          <span className={`flex h-8 w-14 items-center rounded-full border p-0.5 ${on ? "justify-end border-blue bg-blue" : "justify-start border-line bg-line group-hover:border-ink-faint/60"}`}><span className="size-6 rounded-full bg-white shadow-sm" /></span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <form action={hubPausePlan} className="mt-3">{hidden}<input type="hidden" name="jobId" value={p.id} /><input type="hidden" name="pause" value={p.planPausedAt ? "0" : "1"} />
              {p.planPausedAt ? <Tap className="w-full sm:w-auto">Resume my plan</Tap> : <Tap className="w-full sm:w-auto">Pause (I&apos;m away)</Tap>}
            </form>
          </Card>
          );
        })}
        <Card title="Need something done?">
          <p>Pick a service, the address and a time that works. Same prices as our booking page; pay after the job.</p>
          <a href={`/hub/${token}/order`} className={cta(payHere ? "secondary" : "primary", "mt-3")}>Book a service</a>
          <details className="mt-2">
            <summary className="py-2.5 font-semibold text-blue">Not on the list? Just tell us</summary>
            <form action={hubRequestWork} className="space-y-3">{hidden}
              <textarea name="notes" rows={3} required maxLength={2000} aria-label="What do you need done?" placeholder="e.g. Could you clean out the gutters and power wash the deck in spring?" className={inputCls} />
              <Tap>Send request</Tap>
            </form>
          </details>
        </Card>
        {past.length > 0 && (
          <Card title="Recent visits">
            <ul className="-my-3 divide-y divide-line-soft">
              {past.map((v, i) => (
                <li key={v.id} className="py-3">
                  <a href={`/v/${reportLinks[i]}`} className="flex min-h-11 items-center justify-between gap-3 hover:text-blue">
                    <span className="min-w-0"><span className="block font-semibold">{v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title}</span><span className="block text-sm text-ink-soft tabular-nums">{prettyDate(dateOnly(v.scheduledDate))} · see the report</span></span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                  </a>
                  {v.attachments.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media via signed URL */}
                      {v.attachments.map((a) => <img key={a.id} src={signedMediaPath(a.id, "sm", 7)} alt={`${a.kind.charAt(0)}${a.kind.slice(1).toLowerCase()} photo`} className="h-16 w-20 rounded-lg object-cover" />)}
                    </div>
                  )}
                  {v.job.kind === "ONE_OFF" && past.findIndex((x) => x.jobId === v.jobId) === i && (
                    <a href={`/hub/${token}/order?again=${v.jobId}`} className={tap("secondary", "mt-2")}>Book this again</a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {!waiting && quotesCard}
        {invoices.length > 0 && (
          <Card title="Invoices">
            <ul className="-my-2 divide-y divide-line-soft">{invoices.map((inv, i) => {
              const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, today);
              return (
                <li key={inv.id}><a href={`/i/${invoiceLinks[i]}`} className={rowLink}>
                  <span className="min-w-0"><span className="block font-semibold">{inv.subject}</span><span className="block text-sm text-ink-soft tabular-nums">Invoice #{inv.number} · {cad(inv.totalCents)}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5">{view === "PAID" ? <Badge tone="green">Paid</Badge> : autoPayPending(inv.autoPayState) && inv.autoPayOn ? <Badge tone="blue">Card {inv.autoPayState === "RETRYING" ? "tried again" : "charged"} {prettyDate(dateOnly(inv.autoPayOn))}</Badge> : view === "PAST_DUE" ? <Badge tone="red">Past due</Badge> : <Badge tone="amber">Pay now</Badge>}<ChevronRight className="size-4 text-ink-faint" strokeWidth={1.75} aria-hidden /></span>
                </a></li>
              );
            })}</ul>
          </Card>
        )}
        <Card title="Payment history" actions={<a href={`/hub/${token}/statement`} className={textLink}>Statement</a>}>
          {payments.length ? (
            <ul className="-my-2.5 divide-y divide-line-soft">{payments.map((p) => <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5"><span className="min-w-0 tabular-nums">{p.receivedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", year: "numeric" })}<span className="block text-sm text-ink-soft">{p.method === "ETRANSFER" ? "e-Transfer" : p.method.charAt(0) + p.method.slice(1).toLowerCase()} · invoice #{p.invoice.number}</span></span><span className="shrink-0 font-semibold tabular-nums">{cad(p.amountCents - p.refundedCents)}</span></li>)}</ul>
          ) : <p className="text-ink-soft">No payments yet. They&apos;ll be listed here as we receive them.</p>}
        </Card>
        {(cards || card) && (
          <Card title="Card on file">
            {card ? (
              <>
                <p className="tabular-nums"><b className="font-semibold">{card}</b> · expires {String(c.cardExpMonth).padStart(2, "0")}/{String(c.cardExpYear).slice(-2)}</p>
                <p className="mt-1">{c.autoPayConsentAt
                  ? "Automatic payments are on. We email each new invoice first, with the date this card will be charged. Invoices we already sent are not charged."
                  : "Automatic payments are off: you pay each invoice yourself."}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {cards && <form action={hubSetAutoPay}>{hidden}<input type="hidden" name="on" value={c.autoPayConsentAt ? "0" : "1"} />
                    <Tap className="w-full">{c.autoPayConsentAt ? "Turn off automatic payments" : "Charge this card automatically for my invoices"}</Tap></form>}
                  {cards && <form action={hubSaveCard}>{hidden}{c.autoPayConsentAt && <input type="hidden" name="autopay" value="on" />}<Tap className="w-full">Replace card</Tap></form>}
                  <form action={hubRemoveCard}>{hidden}<ConfirmButton message="Remove this card?" className={tap("danger", "w-full")}>Remove card</ConfirmButton></form>
                </div>
              </>
            ) : (
              <form action={hubSaveCard} className="space-y-3">{hidden}
                <p>Optional. e-Transfer and cash always work; a saved card is there if you&apos;d rather not think about it. You type the card on Stripe&apos;s secure page, and we never see or keep the number.</p>
                <TickRow name="autopay"><b className="font-semibold">Charge this card automatically for my invoices.</b> We email each invoice first, with the date the card will be charged. You can turn this off here any time.</TickRow>
                <Tap className="w-full sm:w-auto">Save a card</Tap>
              </form>
            )}
          </Card>
        )}
        {c.phone && (
          <Card title="Text updates" actions={c.smsOptIn ? <Badge tone="green">On</Badge> : <Badge tone="gray">Off</Badge>}>
            <p>{c.smsOptIn ? `We text ${c.phone} when we're on the way and when the job's done.` : `Want a text at ${c.phone} when we're on the way and when the job's done?`}</p>
            <form action={hubSetTexts} className="mt-3">{hidden}<input type="hidden" name="on" value={c.smsOptIn ? "0" : "1"} />
              <Tap className="w-full sm:w-auto">{c.smsOptIn ? "Stop texts" : "Yes, text me"}</Tap>
            </form>
          </Card>
        )}
        <Card title="Send a neighbour our way">
          <p>Share your link. When they book and pay their first invoice, you get {money(refReward)} off your next one.</p>
          <div className="mt-3"><CopyField label="Your link" value={referralLink(refCode)} /></div>
          {creditLeft > 0 && <p className="mt-3 font-semibold text-emerald-800">You have {money(creditLeft)} in credit for your next invoice.</p>}
        </Card>
      </div>
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
