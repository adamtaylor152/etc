/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Client invoice page: what is owed and when, what it is for, how to pay (e-Transfer first, card when it is on), PDF.
import { Download } from "lucide-react";
import { stripeEnabled } from "@/server/stripe";
import { InvoicePay } from "@/components/invoice-pay";
import { Done, Help, LinkProblem, PageTitle, Tap, TotalRow, cta, textLink } from "@/components/public/kit";
import { Card, inputCls, Notice } from "@/components/ui";
import { InvoiceBadge } from "@/components/status";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { parseSettings } from "@/server/settings";
import { peekToken } from "@/server/tokens";
import { prettyDateTime } from "@/server/dates";
import { signedMediaPath } from "@/server/media";
import { SignaturePad } from "@/components/signature-pad";
import { STATEMENTS } from "@/server/ops/signatures";
import { autoPayPending, cardLabel } from "@/server/billing/autopay";
import { clientSignInvoice } from "./actions";

export const metadata = { title: { absolute: "Your invoice · etc." } };

export default async function PublicInvoice({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["INVOICE"]);
  if (!t.ok || !t.token.invoiceId) return <LinkProblem title="This link has expired">Email {env.helpEmail} and we&apos;ll send a fresh one.</LinkProblem>;
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id: t.token.invoiceId },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (inv.status === "DRAFT" || inv.status === "VOID") return <LinkProblem title="This invoice isn't available">It may have been replaced. Get in touch if you have questions.</LinkProblem>;
  const biz = await db.business.findUniqueOrThrow({ where: { id: inv.businessId } });
  const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, todayLocal());
  const balance = Math.max(0, inv.totalCents - inv.amountPaidCents);
  const etransfer = biz.etransferEmail || env.etransferEmail;
  const cards = stripeEnabled() && parseSettings(biz.settings).autoPay, card = cardLabel(inv.client);
  const sig = await db.signature.findFirst({ where: { invoiceId: inv.id }, orderBy: { signedAt: "desc" } });
  const tips = parseSettings(biz.settings).tipsEnabled;
  const owing = balance > 0 && inv.status === "AWAITING_PAYMENT";
  const pdf = <a href={`/i/${token}/pdf`} className={textLink}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download PDF</a>;
  return (
    <>
      {sp.paid && balance > 0 && <div className="no-print"><Notice tone="good">Thanks. Your payment is processing; a receipt is on its way by email.</Notice></div>}
      {sp.error && <div className="no-print"><Notice tone="bad">{String(sp.error)}</Notice></div>}
      <PageTitle eyebrow={`Invoice #${inv.number}`} aside={<InvoiceBadge s={view} />} title={inv.subject}
        sub={<>For {clientName(inv.client)} · issued {prettyDate(dateOnly(inv.issuedOn))}{!owing && <> · due {prettyDate(dateOnly(inv.dueOn))}</>}</>} />
      <div className="grid gap-5">
        {owing ? (
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                <p className="text-sm font-medium text-ink-soft">Amount due</p>
                <p className="mt-1 font-display text-[2.5rem] font-semibold leading-none tabular-nums">{cad(balance)}</p>
              </div>
              <p className={`font-medium tabular-nums ${view === "PAST_DUE" ? "text-red-700" : "text-ink-soft"}`}>{view === "PAST_DUE" ? "Was due" : "Due"} {prettyDate(dateOnly(inv.dueOn))}</p>
            </div>
            {inv.amountPaidCents > 0 && <p className="mt-3 text-sm text-ink-soft tabular-nums">{cad(inv.amountPaidCents)} of {cad(inv.totalCents)} already paid. Thank you.</p>}
            <a href="#pay" className={cta("primary", "no-print mt-4")}>How to pay</a>
          </Card>
        ) : inv.status === "PAID" ? (
          <Done title="Paid in full. Thank you.">
            <p className="tabular-nums">{cad(inv.totalCents)} received. There&apos;s nothing more to do.</p>
            <p className="no-print mt-1">{pdf}</p>
          </Done>
        ) : null}
        {owing && autoPayPending(inv.autoPayState) && inv.autoPayOn && card && (
          <div className="no-print [&>p]:mb-0"><Notice><b className="font-semibold">{inv.autoPayState === "RETRYING" ? `The last charge to your ${card} didn't go through. We'll try again on` : `We'll charge your ${card} on`} {prettyDate(dateOnly(inv.autoPayOn))}.</b> {inv.autoPayState === "SCHEDULED" && "There's nothing you need to do. "}If you&apos;d rather pay another way, do it below before then and the card isn&apos;t charged.</Notice></div>
        )}
        <Card title="What this is for">
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {inv.lineItems.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="font-medium">{l.name}{Number(l.quantity) !== 1 && <span className="font-normal text-ink-soft tabular-nums"> × {Number(l.quantity)}</span>}</span>
                  {l.description && <span className="block text-sm text-ink-soft">{l.description}</span>}
                  <span className="block text-sm text-ink-soft tabular-nums">{prettyDate(dateOnly(l.serviceDate))}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{cad(l.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-line pt-3">
            {inv.discountCents > 0 && <><TotalRow muted label="Subtotal" value={cad(inv.subtotalCents)} /><TotalRow muted label="Discount" value={`−${cad(inv.discountCents)}`} /></>}
            <TotalRow label={<span className="font-semibold">Total</span>} value={<span className="font-display text-xl font-semibold">{cad(inv.totalCents)}</span>} />
            {inv.amountPaidCents > 0 && <><TotalRow muted label="Paid" value={`−${cad(inv.amountPaidCents)}`} /><TotalRow label={<span className="font-semibold">Balance</span>} value={<span className="font-semibold">{cad(balance)}</span>} /></>}
          </dl>
          {inv.message && <p className="mt-4 whitespace-pre-line rounded-lg bg-tint p-3.5">{inv.message}</p>}
          <div className="mt-4 text-sm text-ink-soft">
            <p>{biz.taxRegistered ? `${biz.taxName} ${cad(inv.taxCents)}${biz.pricesIncludeTax ? " included" : ""}${biz.taxNumber ? ` · ${biz.taxName} #${biz.taxNumber}` : ""}` : "Prices include tax."}</p>
            {/* On screen the page footer already says who we are; the footer isn't printed, so paper keeps these two lines. */}
            <p className="mt-2 hidden font-semibold text-navy print:block">{biz.legalName ?? biz.name}</p>
            <p className="hidden break-words print:block">{(biz.website ?? env.siteUrl).replace(/^https?:\/\//, "")} · {env.helpEmail}</p>
          </div>
        </Card>
        {owing && (
          <div id="pay" className="no-print scroll-mt-4">
            <Card title="How to pay">
              <InvoicePay token={token} balanceCents={balance} allowPartial={inv.allowPartial} etransfer={etransfer} etransferRef={inv.etransferRef} offerSave={!!cards && !card} tipOn={tips ? inv.totalCents : undefined} />
            </Card>
          </div>
        )}
        {sig ? (
          <Card title="Signed"><div className="flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt={`Signature of ${sig.signerName}`} className="h-14 w-36 rounded-lg border border-line bg-white object-contain" /><span>{sig.signerName}<span className="block text-sm text-ink-soft tabular-nums">{prettyDateTime(sig.signedAt)}</span></span></div></Card>
        ) : (
          <details className="no-print rounded-xl border border-line bg-white px-4 shadow-card sm:px-5">
            <summary className="py-3.5 font-semibold">Sign to confirm (optional)</summary>
            <form action={clientSignInvoice} className="space-y-3 pb-4">
              <input type="hidden" name="t" value={token} />
              <p className="text-ink-soft">“{STATEMENTS.INVOICE}”</p>
              <label className="block"><span className="mb-1 block font-semibold">Name</span><input name="name" required autoComplete="name" className={`${inputCls} min-h-12`} /></label>
              <div><span className="mb-1 block font-semibold">Signature</span><SignaturePad /></div>
              <Tap>Sign</Tap>
            </form>
          </details>
        )}
      </div>
      {inv.status !== "PAID" && <p className="no-print mt-3 text-center">{pdf}</p>}
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
