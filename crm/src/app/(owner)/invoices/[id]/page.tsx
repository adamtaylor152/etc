import { requireOwner } from "@/server/auth";
import { invoiceAllowPartial } from "../../work2-actions";
import { SignatureCard } from "@/components/signatures";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { InvoiceBadge } from "@/components/status";
import { RecordPanel } from "@/components/record-panel";
import { Button, ButtonLink, Card, Dl, Input, PageHeader, inputCls } from "@/components/ui";
import { TERMS_LABEL, invoiceView } from "@/server/billing/invoice";
import { MAX_ATTEMPTS, autoPayPending, cardLabel } from "@/server/billing/autopay";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { invoiceBadDebt, invoiceMarkSent, invoiceSend, invoiceVoid, paymentDelete, paymentRecord, viewAsClient } from "../../billing-actions";

const METHOD: Record<string, string> = { CASH: "Cash", ETRANSFER: "e-Transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" };
const ATTEMPT: Record<string, string> = { PENDING: "Waiting for Stripe", SUCCEEDED: "Paid", FAILED: "Failed", REQUIRES_ACTION: "Bank wants the client to approve" };
const AUTOPAY_NOTE: Record<string, string> = {
  SCHEDULED: "The client chose automatic payments, and the invoice email told them the date.",
  RETRYING: "The last charge failed and the client was emailed a link to pay or update the card.",
  NEEDS_ACTION: "The client's bank wants them to approve the payment, so they were emailed a link to pay on the invoice page. Nothing more is charged automatically for this invoice.",
  FAILED: "The automatic payment didn't go through and we've stopped trying (details below). Collect this one another way. Auto-pay is still on for the client's next invoices.",
  PAID: "Paid automatically from the client's saved card.",
  STOPPED: "Auto-pay was turned off or the card removed before the charge, so the client pays this one the usual way.",
};

export default async function InvoicePage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const inv = await db.invoice.findFirst({
    where: { id, businessId: bid },
    include: { client: true, job: true, snowEvent: true, lineItems: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { receivedAt: "desc" } } },
  });
  if (!inv) notFound();
  const biz = await business();
  const attempts = inv.autoPayState ? await db.autoPayAttempt.findMany({ where: { invoiceId: inv.id }, orderBy: { n: "desc" } }) : [];
  const view = invoiceView({ ...inv, dueOn: dateOnly(inv.dueOn) }, todayLocal());
  const balance = Math.max(0, inv.totalCents - inv.amountPaidCents);
  const here = `/invoices/${id}`;
  const open = inv.status === "DRAFT" || inv.status === "AWAITING_PAYMENT";
  const hidden = <><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="back" value={here} /></>;
  return (
    <>
      <Flash error={sp.error} />
      {sp.sent && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Invoice emailed to {inv.client.email}.</p>}
      <PageHeader
        title={<>{inv.kind === "DEPOSIT" ? "Deposit invoice" : "Invoice"} #{inv.number} <InvoiceBadge s={view} /></>}
        sub={<><Link className="font-semibold text-blue" href={`/clients/${inv.clientId}`}>{clientName(inv.client)}</Link> · {inv.subject}</>}
        actions={<>
          {open && <form action={invoiceSend}>{hidden}<Button>{inv.status === "DRAFT" ? "Send invoice" : "Resend"}</Button></form>}
          {inv.status === "DRAFT" && inv.kind !== "DEPOSIT" && <ButtonLink href={`${here}/edit`}>Edit</ButtonLink>}
          {inv.status === "DRAFT" && <form action={invoiceMarkSent}>{hidden}<Button variant="secondary">Mark sent (no email)</Button></form>}
          <form action={viewAsClient}>{hidden}<Button variant="secondary">Client view / print</Button></form>
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-soft"><th className="pb-2">Item</th><th className="pb-2">Date</th><th className="pb-2 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-line">
                {inv.lineItems.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2">{l.name}{Number(l.quantity) !== 1 && <span className="text-ink-soft"> × {Number(l.quantity)} @ {money(l.unitPriceCents)}</span>}{l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}</td>
                    <td className="py-2 text-ink-soft">{prettyDate(dateOnly(l.serviceDate))}</td>
                    <td className="py-2 text-right font-semibold">{money(l.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-navy">
                {inv.discountCents > 0 && <tr><td colSpan={2} className="pt-2 text-ink-soft">Subtotal</td><td className="pt-2 text-right text-ink-soft">{money(inv.subtotalCents)}</td></tr>}
                {inv.discountCents > 0 && <tr><td colSpan={2} className="text-ink-soft">Discount</td><td className="text-right text-ink-soft">−{money(inv.discountCents)}</td></tr>}
                {biz.taxRegistered && inv.taxCents > 0 && <tr><td colSpan={2} className="pt-2 text-ink-soft">{biz.taxName}{biz.pricesIncludeTax ? " (included)" : ""}</td><td className="pt-2 text-right">{money(inv.taxCents)}</td></tr>}
                <tr><td colSpan={2} className="pt-2 font-semibold">Total</td><td className="pt-2 text-right font-display text-xl font-bold">{money(inv.totalCents)}</td></tr>
                {inv.amountPaidCents > 0 && <tr><td colSpan={2} className="text-ink-soft">Paid</td><td className="text-right text-ink-soft">−{money(inv.amountPaidCents)}</td></tr>}
                {inv.amountPaidCents > 0 && <tr><td colSpan={2} className="font-semibold">Balance</td><td className="text-right font-semibold">{money(balance)}</td></tr>}
              </tfoot>
            </table>
            {!biz.taxRegistered && <p className="mt-2 text-xs text-ink-soft">Prices include tax (not GST-registered).</p>}
            {inv.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-tint p-3 text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">Message to the client</span>{inv.message}</p>}
          </Card>

          {open && balance > 0 && (
            <Card title="Record a payment">
              <form action={paymentRecord} className="grid items-end gap-3 sm:grid-cols-4">
                <input type="hidden" name="invoiceId" value={inv.id} /><input type="hidden" name="back" value={here} />
                <label className="text-sm font-semibold">Amount ($)<Input name="amount" type="number" step="0.01" min="0.01" defaultValue={(balance / 100).toFixed(2)} required /></label>
                <label className="text-sm font-semibold">Method
                  <select name="method" className={inputCls} defaultValue={inv.client.preferredPayment === "ETRANSFER" ? "ETRANSFER" : "CASH"}>
                    <option value="CASH">Cash</option><option value="ETRANSFER">e-Transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">Reference<Input name="reference" placeholder={inv.etransferRef} /></label>
                <Button>Record</Button>
              </form>
              <p className="mt-2 text-xs text-ink-soft">A receipt is emailed automatically. e-Transfers should mention <b>{inv.etransferRef}</b>.</p>
            </Card>
          )}

          {inv.status !== "VOID" && inv.status !== "PAID" && (
            <form action={invoiceAllowPartial} className="flex items-center gap-2 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
              <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="on" value={inv.allowPartial ? "0" : "1"} />
              <span className="font-semibold">Online partial payments</span><span className="text-ink-soft">{inv.allowPartial ? "on: the client can pay part of the balance" : "off: card payments are for the full balance"}</span>
              <button className="ml-auto min-h-8 rounded-lg border border-line px-2 text-xs font-semibold hover:bg-tint">{inv.allowPartial ? "Turn off" : "Turn on"}</button>
            </form>
          )}
          <Card title="Payments">
            {inv.payments.length ? (
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span><span className="font-semibold">{money(p.amountCents)}</span> · {METHOD[p.method]}{p.reference && ` · ${p.reference}`}<span className="block text-xs text-ink-soft">{prettyDateTime(p.receivedAt)}</span></span>
                    {p.method !== "CARD" && <form action={paymentDelete}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={here} /><button className="text-xs text-ink-soft">Remove</button></form>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">No payments yet.</p>}
          </Card>

          {(attempts.length > 0 || (inv.autoPayState && inv.status === "AWAITING_PAYMENT")) && (
            <Card title="Auto-pay">
              <p className="text-sm">{AUTOPAY_NOTE[inv.autoPayState ?? "STOPPED"]}{autoPayPending(inv.autoPayState) && inv.autoPayOn && <> <b>{inv.autoPayState === "RETRYING" ? "Next try" : `${cardLabel(inv.client) ?? "The card"} is charged ${money(balance)}`} on {prettyDate(dateOnly(inv.autoPayOn))}.</b></>}</p>
              {attempts.length > 0 && (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {attempts.map((a) => (
                    <li key={a.id} className="py-2">Try {a.n} of {MAX_ATTEMPTS} · {money(a.amountCents)} · {a.cardLabel} · <b>{ATTEMPT[a.status]}</b>{a.failureCode && ` (${a.failureCode.replaceAll("_", " ")})`}
                      <span className="block text-xs text-ink-soft">{prettyDateTime(a.createdAt)}{a.failureMessage && ` · ${a.failureMessage}`}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Details">
            <Dl rows={[
              ["Issued", inv.issuedOn ? prettyDate(dateOnly(inv.issuedOn)) : "Not sent yet"],
              ["Due", inv.dueOn ? prettyDate(dateOnly(inv.dueOn)) : null],
              ["Payment terms", TERMS_LABEL[inv.paymentTerms]],
              ["e-Transfer code", inv.etransferRef],
              ["Job", inv.job ? <Link className="text-blue" href={`/jobs/${inv.job.id}`}>#{inv.job.number} {inv.job.title}</Link> : null],
              ["Storm", inv.snowEvent ? <Link className="text-blue" href={`/snow/${inv.snowEvent.id}`}>{inv.snowEvent.name}</Link> : null],
              ["Reminders", inv.remindersSent ? `${inv.remindersSent} sent` : null],
              ["Void reason", inv.voidReason],
            ]} />
            <div className="mt-4 flex flex-wrap gap-2">
              {inv.status === "AWAITING_PAYMENT" && <form action={invoiceBadDebt}>{hidden}<input type="hidden" name="bad" value="1" /><Button variant="secondary">Write off</Button></form>}
              {inv.status === "BAD_DEBT" && <form action={invoiceBadDebt}>{hidden}<input type="hidden" name="bad" value="0" /><Button variant="secondary">Undo write-off</Button></form>}
              {open && !inv.payments.length && <form action={invoiceVoid}>{hidden}<Button variant="danger">Void (charges go back to unbilled)</Button></form>}
            </div>
          </Card>
        </div>
        <div className="space-y-5"><SignatureCard where={{ invoiceId: inv.id }} signHref={`/sign/invoice/${inv.id}`} /><RecordPanel businessId={bid} target={{ invoiceId: inv.id }} clientId={inv.clientId} path={here} /></div>
      </div>
    </>
  );
}
