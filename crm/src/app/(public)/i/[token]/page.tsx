// Client invoice page: view, pay by card (Stripe Checkout), e-Transfer instructions, print / save as PDF.
import { Button, Card } from "@/components/ui";
import { InvoiceBadge } from "@/components/status";
import { invoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { stripeEnabled } from "@/server/stripe";
import { peekToken } from "@/server/tokens";
import { payByCard } from "./actions";

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
                <td className="py-2.5">{l.name}{Number(l.quantity) !== 1 && ` × ${Number(l.quantity)}`}<span className="block text-xs text-ink-soft">{prettyDate(dateOnly(l.serviceDate))}</span></td>
                <td className="py-2.5 text-right font-semibold">{money(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-navy">
            <tr><td className="pt-3 font-semibold">Total</td><td className="pt-3 text-right font-display text-2xl font-bold">{money(inv.totalCents)}</td></tr>
            {inv.amountPaidCents > 0 && <><tr><td className="text-ink-soft">Paid</td><td className="text-right text-ink-soft">−{money(inv.amountPaidCents)}</td></tr><tr><td className="font-semibold">Balance</td><td className="text-right font-semibold">{money(balance)}</td></tr></>}
          </tfoot>
        </table>
        <p className="mt-3 text-xs text-ink-soft">
          {biz.taxRegistered ? `${biz.taxName} ${money(inv.taxCents)}${biz.pricesIncludeTax ? " included" : ""}${biz.taxNumber ? ` · ${biz.taxName} #${biz.taxNumber}` : ""}` : "Prices include tax."}
          {" "}{biz.legalName ?? biz.name} · {(biz.website ?? env.siteUrl).replace(/^https?:\/\//, "")} · {env.helpEmail}
        </p>
      </Card>
      {balance > 0 && inv.status === "AWAITING_PAYMENT" ? (
        <div className="no-print space-y-3">
          {stripeEnabled() && (
            <form action={payByCard}><input type="hidden" name="t" value={token} /><Button className="min-h-14 w-full text-base">Pay {money(balance)} by card</Button></form>
          )}
          {etransfer && (
            <Card title="Pay by e-Transfer">
              <p className="text-sm">Send <b>{money(balance)}</b> to <b className="select-all">{etransfer}</b> and put <b className="select-all">{inv.etransferRef}</b> in the message so we can match it.</p>
            </Card>
          )}
          <p className="text-center text-sm text-ink-soft">Or pay the crew in cash.</p>
        </div>
      ) : inv.status === "PAID" ? (
        <Card className="border-emerald-200 bg-emerald-50"><p className="font-semibold text-emerald-800">Paid in full. Thank you!</p></Card>
      ) : null}
      <p className="no-print text-center"><a href="javascript:print()" className="text-sm font-semibold text-blue">Print or save as PDF</a></p>
    </div>
  );
}
