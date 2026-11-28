/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Client quote page: see the quote and photos, tick optional extras, approve or ask for changes.
import { QuoteApprove } from "@/components/quote-approve";
import { money } from "@/server/money";
import { mintToken } from "@/server/tokens";
import { signedMediaPath } from "@/server/media";
import { Card } from "@/components/ui";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { clientName } from "@/server/queries";
import { quoteExpired } from "@/server/status/quote";
import { peekToken } from "@/server/tokens";
import { clientApprove, clientRequestChanges } from "./actions";

export const metadata = { title: { absolute: "Your quote · etc." } };

export default async function PublicQuote({ params, searchParams }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["QUOTE"]);
  if (!t.ok || !t.token.quoteId) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Email {env.helpEmail} and we&apos;ll send a fresh one.</p></Card>;
  const q = await db.quote.findUniqueOrThrow({ where: { id: t.token.quoteId }, include: { client: true, property: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (q.status === "DRAFT" || q.status === "ARCHIVED") return <Card><h1 className="font-display text-2xl font-bold">This quote isn&apos;t available</h1><p className="mt-2 text-ink-soft">Get in touch if you have questions: {env.helpEmail}.</p></Card>;
  const expired = quoteExpired({ status: q.status, validUntil: dateOnly(q.validUntil) }, todayLocal());
  const canAct = (q.status === "AWAITING_RESPONSE" || q.status === "CHANGES_REQUESTED") && !expired;
  const sig = await db.signature.findFirst({ where: { quoteId: q.id, kind: "QUOTE" }, orderBy: { signedAt: "desc" } });
  const deposit = await db.invoice.findFirst({ where: { kind: "DEPOSIT", quoteId: q.id } });
  const biz = await db.business.findUniqueOrThrow({ where: { id: q.businessId } });
  const depositLink = deposit && deposit.status !== "PAID" ? `/i/${await mintToken(db, q.businessId, "INVOICE", { invoiceId: deposit.id, clientId: q.clientId })}` : null;
  return (
    <div className="space-y-4">
      {sp.approved && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Approved, thank you! Silas will be in touch to book a time.</p>}
      {sp.changes && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Got it. We&apos;ll send an updated quote soon.</p>}
      {sp.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{String(sp.error)}</p>}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">Quote #{q.number}{q.validUntil && ` · good until ${prettyDate(dateOnly(q.validUntil))}`}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{q.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">For {clientName(q.client)}{q.property && ` · ${q.property.formatted}`}</p>
      </div>
      {q.message && <Card><p className="whitespace-pre-line">{q.message}</p></Card>}
      <Card>
        {q.status === "APPROVED" || q.status === "CONVERTED"
          ? <><p className="mb-2 font-semibold text-emerald-700">Approved{q.approvedByName && !q.approvedByName.startsWith("Approved by") ? ` by ${q.approvedByName}` : ""}. Thank you!</p>
            {deposit && deposit.status !== "PAID" && (
              <div className="mb-3 rounded-xl border border-blue/30 bg-blue/5 p-4 text-sm">
                <p className="font-semibold">Deposit due: {money(deposit.totalCents - deposit.amountPaidCents)}{q.depositRequired && " (needed to book your date)"}</p>
                {biz.etransferEmail && <p className="mt-1">Send it by Interac e-Transfer to <b className="select-all">{biz.etransferEmail}</b> with <b className="select-all">{deposit.etransferRef}</b> in the message.</p>}
                {depositLink && <a href={depositLink} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-blue px-5 font-semibold text-white">View deposit invoice</a>}
              </div>
            )}
            {deposit?.status === "PAID" && <p className="mb-3 text-sm font-semibold text-emerald-700">Deposit received. Thank you!</p>}
            {sig && <div className="mb-3 flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt="Your signature" className="h-14 w-36 rounded border border-line bg-white object-contain" /><span className="text-xs text-ink-soft">Signed {sig.signedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })}</span></div>}</>
          : expired ? <p className="mb-2 font-semibold text-red-700">This quote has expired. Reply to our email or call {env.phone} for an updated price.</p> : null}
        <QuoteApprove token={token} action={clientApprove} canAct={canAct} discountCents={q.discountCents}
          lines={q.lineItems.map((l) => ({ id: l.id, name: l.name, description: l.description, totalCents: l.totalCents, isOptional: l.isOptional, isSelected: l.isSelected, qty: Number(l.quantity) !== 1 ? String(Number(l.quantity)) : "" }))} />
      </Card>
      {canAct && (
        <details className="rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">Ask for changes</summary>
          <form action={clientRequestChanges} className="mt-3 space-y-3">
            <input type="hidden" name="t" value={token} />
            <textarea name="message" rows={3} required maxLength={2000} placeholder="e.g. Could you leave out the gate and add the back steps?" className="w-full rounded-xl border border-line p-3" />
            <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">Send to etc.</button>
          </form>
        </details>
      )}
      <p className="text-center text-sm text-ink-soft">Questions? Call {env.phone} or email {env.helpEmail}.</p>
    </div>
  );
}
