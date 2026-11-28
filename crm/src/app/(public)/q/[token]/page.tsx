/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Client quote page: see the quote and photos, choose an option (when offered), tick optional extras, approve (then pay the deposit right here), ask for changes or decline.
import { Download } from "lucide-react";
import { InvoicePay } from "@/components/invoice-pay";
import { Done, Help, LinkProblem, PageTitle, Tap, textLink } from "@/components/public/kit";
import { QuoteApprove } from "@/components/quote-approve";
import { money } from "@/server/money";
import { mintToken } from "@/server/tokens";
import { signedMediaPath } from "@/server/media";
import { Badge, Card, inputCls, Notice } from "@/components/ui";
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
  if (!t.ok || !t.token.quoteId) return <LinkProblem title="This link has expired">Email {env.helpEmail} and we&apos;ll send a fresh one.</LinkProblem>;
  const q = await db.quote.findUniqueOrThrow({ where: { id: t.token.quoteId }, include: { client: true, property: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (q.status === "DRAFT" || q.status === "ARCHIVED") return <LinkProblem title="This quote isn't available">Get in touch if you have questions: {env.helpEmail}.</LinkProblem>;
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
  const approved = q.status === "APPROVED" || q.status === "CONVERTED";
  const state = approved ? <Badge tone="green">Approved</Badge> : q.status === "DECLINED" ? <Badge tone="gray">Declined</Badge> : expired ? <Badge tone="red">Expired</Badge>
    : q.status === "CHANGES_REQUESTED" ? <Badge tone="amber">Being updated</Badge> : null;
  return (
    <>
      {sp.paid && depositDue > 0 && <Notice tone="good">Thanks. Your payment is processing; a receipt is on its way by email.</Notice>}
      {sp.declined && <Notice>Thanks for letting us know.</Notice>}
      {sp.changes && <Notice tone="good">Got it. We&apos;ll send an updated quote soon.</Notice>}
      {sp.error && <Notice tone="bad">{String(sp.error)}</Notice>}
      <PageTitle eyebrow={<>Quote #{q.number}{q.validUntil && !approved && q.status !== "DECLINED" && ` · ${expired ? "was good" : "good"} until ${prettyDate(dateOnly(q.validUntil))}`}</>} aside={state}
        title={q.title} sub={<>For {clientName(q.client)}{q.property && ` · ${q.property.formatted}`}</>} />
      <div className="grid gap-5">
        {approved ? (
          <>
            <Done title={<>Approved{q.approvedByName && !q.approvedByName.startsWith("Approved by") ? ` by ${q.approvedByName}` : ""}. Thank you.</>}>
              {deposit?.status === "PAID" ? <p>Deposit received. Thank you.</p> : sp.approved ? <p>Silas will be in touch to book a time.</p> : null}
              {sig && <p className="mt-3 flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt="Your signature" className="h-14 w-36 rounded-lg border border-emerald-200 bg-white object-contain" /><span className="text-sm tabular-nums">Signed {sig.signedAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" })}</span></p>}
            </Done>
            {deposit && depositToken && (
              <Card title="Pay your deposit">
                <div className="-mt-1 mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
                  <p><span className="block text-sm font-medium text-ink-soft">Deposit due now</span><span className="mt-1 block font-display text-[2.25rem] font-semibold leading-none tabular-nums">{money(depositDue)}</span></p>
                  {q.depositRequired && <p className="text-ink-soft">Needed to book your date</p>}
                </div>
                <InvoicePay token={depositToken} quoteToken={token} balanceCents={depositDue} allowPartial={deposit.allowPartial} etransfer={biz.etransferEmail || env.etransferEmail || null} etransferRef={deposit.etransferRef} />
                <p className="mt-3"><a href={`/i/${depositToken}`} className={textLink}>View the deposit invoice</a></p>
              </Card>
            )}
          </>
        ) : q.status === "DECLINED" ? (
          <Done tone="info" title="This quote was declined.">Changed your mind? Call {env.phone} or email {env.helpEmail}.</Done>
        ) : expired ? (
          <div className="[&>p]:mb-0"><Notice tone="warn">This quote has expired. Reply to our email or call {env.phone} for an updated price.</Notice></div>
        ) : null}
        {q.message && <Card title={`A note from ${biz.name}`}><p className="max-w-[65ch] whitespace-pre-line">{q.message}</p></Card>}
        {photos.length > 0 && (
          <Card title="Photos of the job">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p) => <a key={p.id} href={signedMediaPath(p.id, "md", 30)} target="_blank" rel="noreferrer"><img src={signedMediaPath(p.id, "sm", 30)} alt={p.caption ?? "Job photo"} className="aspect-square w-full rounded-lg object-cover" /></a>)}
            </div>
          </Card>
        )}
        <QuoteApprove token={token} action={clientApprove} canAct={canAct} options={quoteOptions(q.options)} chosen={q.chosenOption} discount={{ discountType: q.discountType, discountValue: q.discountValue, discountCents: q.discountCents }} taxName={biz.taxName}
          tax={{ taxRegistered: biz.taxRegistered, taxRateBps: biz.taxRateBps, pricesIncludeTax: biz.pricesIncludeTax }}
          deposit={{ type: q.depositType, value: q.depositValue, required: q.depositRequired }}
          lines={q.lineItems.map((l) => ({ id: l.id, name: l.name, description: l.description, totalCents: l.totalCents, isOptional: l.isOptional, isSelected: l.isSelected, qty: Number(l.quantity) !== 1 ? String(Number(l.quantity)) : "", optionKey: l.optionKey,
            photo: l.photoId && linePhotos.has(l.photoId) ? { sm: signedMediaPath(l.photoId, "sm", 30), lg: signedMediaPath(l.photoId, "md", 30) } : null }))} />
        {canAct && (
          <section className="rounded-xl border border-line bg-white px-4 shadow-card sm:px-5" aria-label="Other choices">
            <details className="border-b border-line-soft">
              <summary className="py-3.5 font-semibold">Ask for changes</summary>
              <form action={clientRequestChanges} className="space-y-3 pb-4">
                <input type="hidden" name="t" value={token} />
                <textarea name="message" rows={3} required maxLength={2000} aria-label="What would you like changed?" placeholder="e.g. Could you leave out the gate and add the back steps?" className={inputCls} />
                <Tap>Send to etc.</Tap>
              </form>
            </details>
            <details>
              <summary className="py-3.5 font-semibold">Decline this quote</summary>
              <form action={clientDecline} className="space-y-3 pb-4">
                <input type="hidden" name="t" value={token} />
                <textarea name="reason" rows={2} maxLength={2000} aria-label="Reason (optional)" placeholder="Anything we should know? (optional)" className={inputCls} />
                <Tap variant="danger">Decline quote</Tap>
              </form>
            </details>
          </section>
        )}
      </div>
      <p className="mt-3 text-center"><a href={`/q/${token}/pdf`} className={textLink}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download PDF</a></p>
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
