// Client hub: upcoming & past visits (with photos), quotes, invoices, snow plan pause, ask for more work.
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { signedMediaPath } from "@/server/media";
import { money } from "@/server/money";
import { mintToken, peekToken } from "@/server/tokens";
import { hubPausePlan, hubRequestWork } from "./actions";

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
      include: { job: true, property: true, attachments: { where: { deletedAt: null, sharedWithClient: true }, orderBy: { createdAt: "asc" }, take: 4 } },
    }),
    db.quote.findMany({ where: { clientId: c.id, status: { in: ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED"] } }, orderBy: { number: "desc" } }),
    db.invoice.findMany({ where: { clientId: c.id, status: { in: ["AWAITING_PAYMENT", "PAID"] } }, orderBy: { number: "desc" } }),
    db.job.findMany({ where: { clientId: c.id, kind: "SNOW_PLAN", closedAt: null }, include: { property: true, season: true } }),
  ]);
  // Fresh scoped links for each quote / invoice / visit report.
  const link = async (purpose: "QUOTE" | "INVOICE" | "VISIT_REPORT", ref: Record<string, string>) => mintToken(db, c.businessId, purpose, { clientId: c.id, ...ref });
  const upcoming = visits.filter((v) => v.state !== "COMPLETED" && v.state !== "SKIPPED").reverse();
  const past = visits.filter((v) => v.state === "COMPLETED").slice(0, 10);
  const quoteLinks = await Promise.all(quotes.map((q) => link("QUOTE", { quoteId: q.id })));
  const invoiceLinks = await Promise.all(invoices.map((i) => link("INVOICE", { invoiceId: i.id })));
  const reportLinks = await Promise.all(past.map((v) => link("VISIT_REPORT", { visitId: v.id })));
  const owing = invoices.filter((i) => i.status === "AWAITING_PAYMENT").reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0);
  const hidden = <input type="hidden" name="t" value={token} />;
  return (
    <div className="space-y-4">
      {sp.plan && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Your snow plan is {String(sp.plan)}. We&apos;ve let Silas know.</p>}
      {sp.requested && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Thanks! We got your request and will be in touch.</p>}
      {sp.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{String(sp.error)}</p>}
      <h1 className="font-display text-3xl font-bold">Hi {c.firstName}!</h1>
      {owing > 0 && <Card className="border-blue/30"><p className="font-semibold">{money(owing)} owing. Pay from an invoice below.</p></Card>}

      {plans.map((p) => (
        <Card key={p.id} title="Every-snowfall plan">
          <p className="text-sm">{p.property.formatted} · {p.season?.name} · we come when {p.triggerCm ?? p.season?.defaultTriggerCm ?? 2} cm or more falls · {money(p.pricePerPushCents ?? 3000)} per clearing{p.iceMelt ? " + ice melt" : ""}.</p>
          <form action={hubPausePlan} className="mt-3">{hidden}<input type="hidden" name="jobId" value={p.id} /><input type="hidden" name="pause" value={p.planPausedAt ? "0" : "1"} />
            {p.planPausedAt
              ? <><Badge tone="amber">Paused</Badge> <button className="ml-2 min-h-11 rounded-full bg-blue px-5 font-semibold text-white">Resume my plan</button></>
              : <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">Pause (I&apos;m away)</button>}
          </form>
        </Card>
      ))}

      <Card title="Upcoming">
        {upcoming.length ? (
          <ul className="divide-y divide-line">{upcoming.map((v) => <li key={v.id} className="py-2.5 text-sm"><b>{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Date to be confirmed"}</b> · {v.job.kind === "SNOW_PLAN" ? "Snow clearing" : v.job.title} · {v.property.formatted}</li>)}</ul>
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

      <Card title="Need something else?">
        <form action={hubRequestWork} className="space-y-3">{hidden}
          <textarea name="notes" rows={3} required maxLength={2000} placeholder="e.g. Could you clean out the gutters and power wash the deck in spring?" className="w-full rounded-xl border border-line p-3" />
          <button className="min-h-11 rounded-full bg-blue px-5 font-semibold text-white">Send request</button>
        </form>
      </Card>
      <p className="text-center text-sm text-ink-soft">Questions? Call {env.phone} or email {env.helpEmail}. This page is private to you.</p>
    </div>
  );
}
