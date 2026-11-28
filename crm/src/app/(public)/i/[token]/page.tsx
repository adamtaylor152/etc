/* eslint-disable @next/next/no-img-element -- private photos/signatures via signed URLs, not optimizable */
// Client invoice page: view, pay by card (Stripe Checkout), e-Transfer instructions, print / save as PDF.
import { InvoicePay } from "@/components/invoice-pay";
import { Card } from "@/components/ui";
import { InvoiceBadge } from "@/components/status";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { peekToken } from "@/server/tokens";
import { prettyDateTime } from "@/server/dates";
import { signedMediaPath } from "@/server/media";
import { SignaturePad } from "@/components/signature-pad";
import { STATEMENTS } from "@/server/ops/signatures";
import { autoPayPending, cardLabel } from "@/server/billing/autopay";
import { parseSettings } from "@/server/settings";
import { clientSignInvoice } from "./actions";

export const metadata = { title: { absolute: "Your invoice · etc." } };

export default async function PublicInvoice({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["INVOICE"]);
  if (!t.ok || !t.token.invoiceId) return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Email {env.helpEmail} and we&apos;ll send a fresh one.</p></Card>;
  const inv = await db.invoice.findUniqueOrThrow({
    where: { id: t.token.invoiceId },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (inv.status === "DRAFT" || inv.status === "VOID") return <Card><h1 className="font-display text-2xl font-bold">This invoice isn&apos;t available</h1><p className="mt-2 text-ink-soft">It may have been replaced. Get in touch if you have questions.</p></Card>;
  const biz = await db.business.findUniqueOrThrow({ where: { id: inv.businessId } });
  const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, todayLocal());
  const balance = Math.max(0, inv.totalCents - inv.amountPaidCents);
  const etransfer = biz.etransferEmail || env.etransferEmail;
  const cards = stripeEnabled() && parseSettings(biz.settings).autoPay, card = cardLabel(inv.client);
  const sig = await db.signature.findFirst({ where: { invoiceId: inv.id }, orderBy: { signedAt: "desc" } });
  return (
    <div className="space-y-4">
      {sp.paid && balance > 0 && <p className="no-print rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Thanks! Your payment is processing; a receipt is on its way by email.</p>}
      {sp.error && <p className="no-print rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{String(sp.error)}</p>}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue">Invoice #{inv.number}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{inv.subject}</h1>
            <p className="mt-1 text-sm text-ink-soft">For {clientName(inv.client)} · issued {prettyDate(dateOnly(inv.issuedOn))} · due {prettyDate(dateOnly(inv.dueOn))}</p>
          </div>
          <InvoiceBadge s={view} />
        </div>
        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-line">
            {inv.lineItems.map((l) => (
              <tr key={l.id}>
                <td className="py-2.5">{l.name}{Number(l.quantity) !== 1 && ` × ${Number(l.quantity)}`}{l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}<span className="block text-xs text-ink-soft">{prettyDate(dateOnly(l.serviceDate))}</span></td>
                <td className="py-2.5 text-right font-semibold">{money(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-navy">
            {inv.discountCents > 0 && <><tr><td className="pt-3 text-ink-soft">Subtotal</td><td className="pt-3 text-right text-ink-soft">{money(inv.subtotalCents)}</td></tr><tr><td className="text-ink-soft">Discount</td><td className="text-right text-ink-soft">−{money(inv.discountCents)}</td></tr></>}
            <tr><td className="pt-3 font-semibold">Total</td><td className="pt-3 text-right font-display text-2xl font-bold">{money(inv.totalCents)}</td></tr>
            {inv.amountPaidCents > 0 && <><tr><td className="text-ink-soft">Paid</td><td className="text-right text-ink-soft">−{money(inv.amountPaidCents)}</td></tr><tr><td className="font-semibold">Balance</td><td className="text-right font-semibold">{money(balance)}</td></tr></>}
          </tfoot>
        </table>
        {inv.message && <p className="mt-4 whitespace-pre-line rounded-lg bg-tint p-3 text-sm">{inv.message}</p>}
        <p className="mt-3 text-xs text-ink-soft">
          {biz.taxRegistered ? `${biz.taxName} ${money(inv.taxCents)}${biz.pricesIncludeTax ? " included" : ""}${biz.taxNumber ? ` · ${biz.taxName} #${biz.taxNumber}` : ""}` : "Prices include tax."}
          {" "}{biz.legalName ?? biz.name} · {(biz.website ?? env.siteUrl).replace(/^https?:\/\//, "")} · {env.helpEmail}
        </p>
      </Card>
      {balance > 0 && inv.status === "AWAITING_PAYMENT" ? (
        <>
        <div className="no-print mb-3">
          {autoPayPending(inv.autoPayState) && inv.autoPayOn && card && (
            <Card className="border-blue/30"><p className="text-sm"><b>{inv.autoPayState === "RETRYING" ? `The last charge to your ${card} didn't go through. We'll try again on` : `We'll charge your ${card} on`} {prettyDate(dateOnly(inv.autoPayOn))}.</b> {inv.autoPayState === "SCHEDULED" && "There's nothing you need to do. "}If you&apos;d rather pay another way, do it below before then and the card isn&apos;t charged.</p></Card>
          )}
        </div>
        <InvoicePay token={token} balanceCents={balance} allowPartial={inv.allowPartial} etransfer={etransfer} etransferRef={inv.etransferRef} offerSave={!!cards && !card} />
        </>
      ) : inv.status === "PAID" ? (
        <Card className="border-emerald-200 bg-emerald-50"><p className="font-semibold text-emerald-800">Paid in full. Thank you!</p></Card>
      ) : null}
      {sig ? (
        <Card title="Signed"><div className="flex items-center gap-3"><img src={signedMediaPath(sig.attachmentId, "sm", 30)} alt="Signature" className="h-14 w-36 rounded border border-line object-contain" /><span className="text-sm">{sig.signerName}<span className="block text-xs text-ink-soft">{prettyDateTime(sig.signedAt)}</span></span></div></Card>
      ) : (
        <details className="no-print rounded-lg border border-line bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Sign to confirm (optional)</summary>
          <form action={clientSignInvoice} className="mt-3 space-y-3">
            <input type="hidden" name="t" value={token} />
            <p className="text-sm text-ink-soft">“{STATEMENTS.INVOICE}”</p>
            <label className="block text-sm font-semibold">Name<input name="name" required className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" /></label>
            <SignaturePad />
            <button className="min-h-11 rounded-lg bg-navy px-4 font-semibold text-white">Sign</button>
          </form>
        </details>
      )}
      <p className="no-print text-center"><a href="javascript:print()" className="text-sm font-semibold text-blue">Print or save as PDF</a></p>
    </div>
  );
}
