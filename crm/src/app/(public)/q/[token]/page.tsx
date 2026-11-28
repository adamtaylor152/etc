/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Client quote page: see the quote and photos, choose an option (when offered), tick optional extras, approve (then pay the deposit right here), ask for changes or decline.
import { InvoicePay } from "@/components/invoice-pay";
import { QuoteApprove } from "@/components/quote-approve";
import { money } from "@/server/money";
import { mintToken } from "@/server/tokens";
import { signedMediaPath } from "@/server/media";
import { Card } from "@/components/ui";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { clientName } from "@/server/queries";
import { quoteExpired, quoteOptions } from "@/server/status/quote";
import { peekToken } from "@/server/tokens";
import { clientApprove, clientDecline, clientRequestChanges } from "./actions";

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
  // Photos the client sent with their request, plus any we chose to share with them.
  const photos = await db.attachment.findMany({
    where: { businessId: q.businessId, deletedAt: null, mediaType: "IMAGE", AND: [{ OR: [{ quoteId: q.id }, ...(q.requestId ? [{ requestId: q.requestId }] : [])] }, { OR: [{ uploadedByType: "CLIENT" }, { sharedWithClient: true }] }] },
    orderBy: { createdAt: "asc" }, take: 20,
  });
  // One picture per line, where the owner added one. Private: reachable only through these signed links.
  const linePhotos = new Set((await db.attachment.findMany({ where: { id: { in: q.lineItems.flatMap((l) => l.photoId ?? []) }, businessId: q.businessId, mediaType: "IMAGE", deletedAt: null }, select: { id: true } })).map((a) => a.id));
  const biz = await db.business.findUniqueOrThrow({ where: { id: q.businessId } });
  const depositDue = deposit?.status === "AWAITING_PAYMENT" ? Math.max(0, deposit.totalCents - deposit.amountPaidCents) : 0;
  const depositToken = deposit && depositDue > 0 ? await mintToken(db, q.businessId, "INVOICE", { invoiceId: deposit.id, clientId: q.clientId }) : null;
  return (
    <div className="space-y-4">
      {sp.approved && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Approved, thank you! Silas will be in touch to book a time.</p>}
      {sp.paid && depositDue > 0 && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Thanks! Your payment is processing; a receipt is on its way by email.</p>}
      {sp.declined && <p className="rounded-xl border border-line bg-tint p-3 font-medium">Thanks for letting us know.</p>}
      {sp.changes && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-medium text-emerald-800">Got it. We&apos;ll send an updated quote soon.</p>}
      {sp.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{String(sp.error)}</p>}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">Quote #{q.number}{q.validUntil && ` · good until ${prettyDate(dateOnly(q.validUntil))}`}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{q.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">For {clientName(q.client)}{q.property && ` · ${q.property.formatted}`}</p>
      </div>
      {q.message && <Card><p className="whitespace-pre-line">{q.message}</p></Card>}
      {photos.length > 0 && (
        <Card>
          <p className="mb-2 text-sm font-semibold">Photos of the job</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => <a key={p.id} href={signedMediaPath(p.id, "md", 30)} target="_blank" rel="noreferrer"><img src={signedMediaPath(p.id, "sm", 30)} alt={p.caption ?? "Job photo"} className="aspect-square w-full rounded-lg object-cover" /></a>)}
          </div>
        </Card>
      )}
      <Card>
        {q.status === "APPROVED" || q.status === "CONVERTED"
          ? <><p className="mb-2 font-semibold text-emerald-700">Approved{q.approvedByName && !q.approvedByName.startsWith("Approved by") ? ` by ${q.approvedByName}` : ""}. Thank you!</p>
            {deposit && depositToken && (
              <div className="mb-3 space-y-3 rounded-xl border border-blue/30 bg-blue/5 p-4">
                <p className="font-semibold">Deposit due now: {money(depositDue)}{q.depositRequired && " (needed to book your date)"}</p>
                <InvoicePay token={depositToken} quoteToken={token} balanceCents={depositDue} allowPartial={deposit.allowPartial} etransfer={biz.etransferEmail || env.etransferEmail || null} etransferRef={deposit.etransferRef} />
                <a href={`/i/${depositToken}`} className="block text-center text-sm font-semibold text-blue">View the deposit invoice</a>
              </div>
            )}
            {deposit?.status === "PAID" && <p className="mb-3 text-sm font-semibold text-emerald-700">Deposit received. Thank you!</p>}
            {sig && <div className="mb-3 flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt="Your signature" className="h-14 w-36 rounded border border-line bg-white object-contain" /><span className="text-xs text-ink-soft">Signed {sig.signedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })}</span></div>}</>
          : q.status === "DECLINED" ? <p className="mb-2 font-semibold text-ink-soft">This quote was declined. Changed your mind? Call {env.phone} or email {env.helpEmail}.</p>
          : expired ? <p className="mb-2 font-semibold text-red-700">This quote has expired. Reply to our email or call {env.phone} for an updated price.</p> : null}
        <QuoteApprove token={token} action={clientApprove} canAct={canAct} options={quoteOptions(q.options)} chosen={q.chosenOption} discount={{ discountType: q.discountType, discountValue: q.discountValue, discountCents: q.discountCents }} taxName={biz.taxName}
          tax={{ taxRegistered: biz.taxRegistered, taxRateBps: biz.taxRateBps, pricesIncludeTax: biz.pricesIncludeTax }}
          lines={q.lineItems.map((l) => ({ id: l.id, name: l.name, description: l.description, totalCents: l.totalCents, isOptional: l.isOptional, isSelected: l.isSelected, qty: Number(l.quantity) !== 1 ? String(Number(l.quantity)) : "", optionKey: l.optionKey,
            photo: l.photoId && linePhotos.has(l.photoId) ? { sm: signedMediaPath(l.photoId, "sm", 30), lg: signedMediaPath(l.photoId, "md", 30) } : null }))} />
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
      {canAct && (
        <details className="rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">Decline this quote</summary>
          <form action={clientDecline} className="mt-3 space-y-3">
            <input type="hidden" name="t" value={token} />
            <textarea name="reason" rows={2} maxLength={2000} placeholder="Anything we should know? (optional)" className="w-full rounded-xl border border-line p-3" />
            <button className="min-h-11 rounded-full border-2 border-line bg-white px-5 font-semibold">Decline quote</button>
          </form>
        </details>
      )}
      <p className="text-center text-sm text-ink-soft">Questions? Call {env.phone} or email {env.helpEmail}.</p>
    </div>
  );
}
