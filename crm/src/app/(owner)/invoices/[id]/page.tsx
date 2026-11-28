import { requireOwner } from "@/server/auth";
import { invoiceAllowPartial } from "../../work2-actions";
import { SignatureCard } from "@/components/signatures";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, FileDown } from "lucide-react";
import { Amount, Ledger, type LedgerRow } from "@/components/billing/money";
import { ConfirmButton } from "@/components/confirm-button";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Menu, type MenuItem } from "@/components/menu";
import { InvoiceBadge } from "@/components/status";
import { RecordPanel } from "@/components/record-panel";
import { Badge, Button, ButtonLink, Card, Dl, Field, Input, Notice, btn, inputCls, type Tone } from "@/components/ui";
import { refundableCents, refundRoute } from "@/server/billing/adjustments";
import { TERMS_LABEL, invoiceView } from "@/server/billing/invoice";
import { MAX_ATTEMPTS, autoPayPending, cardLabel } from "@/server/billing/autopay";
import { declineWords } from "@/server/billing/decline-words";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { paymentRefund } from "../../billing-extras-actions";
import { invoiceBadDebt, invoiceMarkSent, invoiceSend, invoiceVoid, paymentDelete, paymentRecord, viewAsClient } from "../../billing-actions";

const METHOD: Record<string, string> = { CASH: "Cash", ETRANSFER: "e-Transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" };
/** Why a try failed, in words (the stored code stays as it is). A paid try keeps its own note: the invoice was voided mid-charge. */
const attemptNote = (a: { status: string; failureCode: string | null; failureMessage: string | null }) => {
  if (a.status === "SUCCEEDED") return a.failureMessage ? ` · ${a.failureMessage}` : "";
  if (!a.failureCode && !a.failureMessage) return "";
  const why = declineWords(a.failureCode);
  return ` · ${why[0].toUpperCase()}${why.slice(1)}`;
};
const ATTEMPT: Record<string, [string, Tone]> = { PENDING: ["Processing", "gray"], SUCCEEDED: ["Paid", "green"], FAILED: ["Failed", "red"], REQUIRES_ACTION: ["Bank wants the client to approve", "amber"] };
const AUTOPAY_STATE: Record<string, [string, Tone]> = {
  SCHEDULED: ["Scheduled", "blue"], RETRYING: ["Retrying", "amber"], NEEDS_ACTION: ["Needs the client", "amber"], FAILED: ["Failed", "red"], PAID: ["Paid", "green"], STOPPED: ["Stopped", "gray"],
};
const AUTOPAY_NOTE: Record<string, string> = {
  SCHEDULED: "The client chose automatic payments, and the invoice email told them the date.",
  RETRYING: "The last charge failed and the client was emailed a link to pay or update the card.",
  NEEDS_ACTION: "The client's bank wants them to approve the payment, so they were emailed a link to pay on the invoice page. Nothing more is charged automatically for this invoice.",
  FAILED: "The automatic payment didn't go through and we've stopped trying (details below). Collect this one another way. Auto-pay is still on for the client's next invoices.",
  PAID: "Paid automatically from the client's saved card.",
  STOPPED: "Auto-pay was turned off or the card removed before the charge, so the client pays this one the usual way.",
};

export async function generateMetadata({ params }: PageProps<"/invoices/[id]">) {
  await requireOwner();
  const inv = await db.invoice.findFirst({ where: { id: (await params).id, businessId: await businessId() }, select: { number: true } });
  return { title: inv ? `Invoice #${inv.number}` : "Invoice" };
}

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
  const refunded = inv.payments.reduce((n, p) => n + p.refundedCents, 0);
  const holdsMoney = inv.payments.some((p) => p.refundedCents < p.amountCents); // a fully refunded payment doesn't block a void
  const kept = await db.clientCredit.findMany({ where: { paymentId: { in: inv.payments.map((p) => p.id) } } }); // overpayments kept as credit
  const hidden = <><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="back" value={here} /></>;
  const fields = { id: inv.id, back: here };
  const canPay = open && balance > 0;
  const due = dateOnly(inv.dueOn);
  const dated = inv.lineItems.some((l) => l.serviceDate); // no empty Date column on invoices without service dates

  // Everything that isn't the next step lives under More.
  const more: MenuItem[] = [
    ...(inv.status === "DRAFT" ? [{ label: "Mark sent (no email)", action: invoiceMarkSent, fields }] : []),
    { label: "Client view", action: viewAsClient, fields },
    ...(inv.status === "AWAITING_PAYMENT" ? [{ divider: true as const }, { label: "Write off", action: invoiceBadDebt, fields: { ...fields, bad: "1" }, confirm: "Write this invoice off as bad debt? You can undo it later." }] : []),
    ...(inv.status === "BAD_DEBT" ? [{ divider: true as const }, { label: "Undo write-off", action: invoiceBadDebt, fields: { ...fields, bad: "0" } }] : []),
    ...(open && !holdsMoney ? [...(inv.status === "DRAFT" ? [{ divider: true as const }] : []), { label: "Void invoice", action: invoiceVoid, fields, danger: true, confirm: "Void this invoice? Its charges go back to unbilled." }] : []),
  ];

  const taxLine = biz.taxRegistered && inv.taxCents > 0;
  const ledger: LedgerRow[] = [
    ...(inv.discountCents > 0 ? [{ label: "Subtotal", cents: inv.subtotalCents }, { label: "Discount", cents: inv.discountCents, kind: "minus" as const }] : []),
    ...(taxLine ? [{ label: `${biz.taxName}${biz.pricesIncludeTax ? " (included)" : ""}`, cents: inv.taxCents }] : []),
    inv.status === "DRAFT" || inv.status === "VOID"
      ? { label: "Total", cents: inv.totalCents, kind: "strong" as const, tone: inv.status === "VOID" ? "muted" as const : undefined, note: inv.status === "VOID" ? "void" : undefined }
      : { label: "Total", cents: inv.totalCents, kind: "total" as const },
    ...(inv.amountPaidCents > 0 ? [{ label: "Paid", cents: inv.amountPaidCents, kind: "minus" as const }] : []),
    ...(inv.status === "DRAFT" || inv.status === "VOID" ? [] : [
      view === "PAID" ? { label: "Balance", cents: balance, kind: "strong" as const, tone: "good" as const, note: "paid" }
        : view === "PAST_DUE" ? { label: "Balance", cents: balance, kind: "strong" as const, tone: "bad" as const, note: "past due" }
        : view === "BAD_DEBT" ? { label: "Balance", cents: balance, kind: "strong" as const, tone: "muted" as const, note: "written off" }
        : { label: "Balance", cents: balance, kind: "strong" as const, note: due ? `due ${prettyDate(due)}` : undefined },
    ]),
  ];

  const autoState = inv.autoPayState ?? "STOPPED";
  const autoFailed = autoState === "FAILED";
  // Auto-pay is calm when it is working; when it needs someone, it moves to the top of the page.
  const autoTrouble = inv.status === "AWAITING_PAYMENT" && ["FAILED", "RETRYING", "NEEDS_ACTION"].includes(autoState);
  const autoPayCard = (attempts.length > 0 || (inv.autoPayState && inv.status === "AWAITING_PAYMENT")) && (
            <Card title="Auto-pay" actions={<Badge tone={AUTOPAY_STATE[autoState][1]}>{AUTOPAY_STATE[autoState][0]}</Badge>} className={autoFailed ? "border-red-200" : autoTrouble ? "border-amber-300" : ""}>
              <p className={`max-w-[70ch] text-sm ${autoFailed ? "font-medium text-red-900" : "text-ink-soft"}`}>{AUTOPAY_NOTE[autoState]}</p>
              {autoPayPending(inv.autoPayState) && inv.autoPayOn && (
                <p className="mt-2 text-sm font-medium tabular-nums">{inv.autoPayState === "RETRYING" ? "Next try" : `${cardLabel(inv.client) ?? "The card"} is charged ${cad(balance)}`} on {prettyDate(dateOnly(inv.autoPayOn))}.</p>
              )}
              {attempts.length > 0 && (
                <ul className="mt-3 divide-y divide-line-soft border-t border-line-soft text-sm">
                  {attempts.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 last:pb-0">
                      <div className="min-w-0">
                        <span className="font-medium tabular-nums">Try {a.n} of {MAX_ATTEMPTS}</span><span className="text-ink-soft"> · {a.cardLabel}</span>
                        <span className="block text-xs tabular-nums text-ink-soft">{prettyDateTime(a.createdAt)}{attemptNote(a)}</span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1"><Amount cents={a.amountCents} className="font-medium" /><Badge tone={ATTEMPT[a.status]?.[1] ?? "gray"}>{ATTEMPT[a.status]?.[0] ?? a.status}</Badge></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
  return (
    <>
      <Flash error={sp.error} />
      {sp.refunded && <Notice tone="good">Refund recorded. A refund receipt is on its way to the client.</Notice>}
      {refunded > 0 && inv.status === "AWAITING_PAYMENT" && <Notice tone="warn">{cad(refunded)} was refunded, so this invoice shows {cad(balance)} owing again. If nothing more is owed, write it off{holdsMoney ? "" : " or void it"} from the More menu. No automatic reminders go out for it.</Notice>}
      {sp.sent && <Notice tone="good">Invoice emailed to {inv.client.email}.</Notice>}
      <DetailHeader
        back={{ href: "/invoices", label: "Invoices" }}
        kind={inv.kind === "DEPOSIT" ? "Deposit invoice" : "Invoice"}
        status={<InvoiceBadge s={view} />}
        title={<>#{inv.number} <span className="text-ink-soft">·</span> {cad(inv.totalCents)}</>}
        sub={<>
          <Link className="font-semibold text-blue hover:text-blue-deep" href={`/clients/${inv.clientId}`}>{clientName(inv.client)}</Link>{inv.subject && <> · {inv.subject}</>}
          <span className="mt-0.5 block tabular-nums">
            {view === "PAID" ? <span className="font-medium text-emerald-700">Paid{inv.paidAt ? ` ${prettyDate(dateOnly(inv.paidAt))}` : ""}</span>
              : view === "PAST_DUE" ? <span className="font-medium text-red-700">Past due: {cad(balance)} was due {prettyDate(due)}</span>
              : view === "VOID" ? (inv.voidReason ? `Voided: ${inv.voidReason}` : null)
              : view === "BAD_DEBT" ? `${cad(balance)} written off as bad debt`
              : due ? <>{cad(balance)} due {prettyDate(due)}</>
              : "Not sent yet"}
          </span>
        </>}
        actions={<>
          {inv.status === "DRAFT" && <form action={invoiceSend}>{hidden}<Button>Send invoice</Button></form>}
          {inv.status !== "DRAFT" && canPay && <a href="#record-payment" className={btn("primary")}>Record payment</a>}
          {view === "PAID" && <span className="inline-flex min-h-10 items-center gap-1.5 px-1 text-sm font-semibold text-emerald-700"><CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />Paid in full</span>}
          {inv.status === "AWAITING_PAYMENT" && <form action={invoiceSend}>{hidden}<Button variant="secondary">Resend</Button></form>}
          {inv.status === "DRAFT" && inv.kind !== "DEPOSIT" && <ButtonLink href={`${here}/edit`}>Edit</ButtonLink>}
          <a href={`/api/export/pdf/invoice/${inv.id}`} target="_blank" rel="noreferrer" className={btn("secondary")}><FileDown className="size-4" strokeWidth={1.75} aria-hidden />PDF</a>
          <Menu items={more} />
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {autoTrouble && autoPayCard}
          <Card title="Line items">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium text-ink-soft">
                  <th scope="col" className="pb-2 font-medium">Item</th>
                  {dated && <th scope="col" className="hidden whitespace-nowrap pb-2 pl-3 font-medium sm:table-cell">Date</th>}
                  <th scope="col" className="pb-2 pl-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {inv.lineItems.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2.5">
                      <span className="font-medium">{l.name}</span>{Number(l.quantity) !== 1 && <span className="tabular-nums text-ink-soft"> × {Number(l.quantity)} @ {cad(l.unitPriceCents)}</span>}
                      {l.description && <span className="block max-w-[60ch] text-xs text-ink-soft">{l.description}</span>}
                      {l.serviceDate && <span className="block text-xs tabular-nums text-ink-soft sm:hidden">{prettyDate(dateOnly(l.serviceDate))}</span>}
                    </td>
                    {dated && <td className="hidden whitespace-nowrap py-2.5 pl-3 tabular-nums text-ink-soft sm:table-cell">{prettyDate(dateOnly(l.serviceDate))}</td>}
                    <td className="py-2.5 pl-3 text-right"><Amount cents={l.totalCents} className="font-medium" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!inv.lineItems.length && <p className="py-3 text-sm text-ink-soft">No line items yet.{inv.status === "DRAFT" && inv.kind !== "DEPOSIT" && <> <Link href={`${here}/edit`} className="font-semibold text-blue">Add some</Link></>}</p>}
            <Ledger rows={ledger} className="border-t border-line pt-1.5" />
            {!biz.taxRegistered && <p className="mt-2 text-right text-xs text-ink-soft">Prices include tax (not GST-registered).</p>}
            {inv.message && (
              <div className="mt-4 rounded-lg bg-tint p-3 text-sm">
                <p className="mb-0.5 text-xs font-medium text-ink-soft">Message to the client</p>
                <p className="max-w-[70ch] whitespace-pre-line">{inv.message}</p>
              </div>
            )}
          </Card>

          {canPay && (
            <Card title="Record a payment" className="scroll-mt-20">
              <form id="record-payment" action={paymentRecord} className="scroll-mt-24 space-y-3">
                <input type="hidden" name="invoiceId" value={inv.id} /><input type="hidden" name="back" value={here} />
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[9rem_10rem_1fr_auto]">
                  <Field label="Amount ($)"><Input name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" defaultValue={(balance / 100).toFixed(2)} required className="text-right tabular-nums" /></Field>
                  <Field label="Method">
                    <select name="method" className={inputCls} defaultValue={inv.client.preferredPayment === "ETRANSFER" ? "ETRANSFER" : "CASH"}>
                      <option value="CASH">Cash</option><option value="ETRANSFER">e-Transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <div className="col-span-2 sm:col-span-1"><Field label="Reference"><Input name="reference" placeholder={inv.etransferRef} /></Field></div>
                  <Button variant="secondary" className="col-span-2 sm:col-span-1">Save payment</Button>
                </div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="keepExtra" className="mt-0.5 size-4 shrink-0" /> If this is more than the balance, keep the extra as account credit for their next invoice</label>
              </form>
              <p className="mt-3 text-xs text-ink-soft">A receipt is emailed automatically. e-Transfers should mention <span className="font-semibold text-navy">{inv.etransferRef}</span>.</p>
            </Card>
          )}

          <Card title="Payments">
            {inv.payments.length ? (
              <ul className="divide-y divide-line-soft">
                {inv.payments.map((p) => {
                  const left = refundableCents(p), route = refundRoute(p), extra = kept.filter((k) => k.paymentId === p.id).reduce((n, k) => n + k.amountCents, 0);
                  const canRemove = p.method !== "CARD" && p.refundedCents === 0, canRefund = left > 0 && inv.status !== "VOID";
                  return (
                    <li key={p.id} className="py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-medium">{METHOD[p.method]}</span>{p.reference && <span className="text-ink-soft"> · {p.reference}</span>}
                          <span className="block text-xs tabular-nums text-ink-soft">{prettyDateTime(p.receivedAt)}</span>
                        </div>
                        <div className="text-right">
                          <Amount cents={p.amountCents} className="font-semibold" />
                          {p.tipCents ? <span className="block text-xs tabular-nums text-ink-soft">plus {cad(p.tipCents)} tip</span> : null}
                          {extra > 0 && <span className="block text-xs tabular-nums text-ink-soft">plus {cad(extra)} kept as credit</span>}
                          {p.refundedCents > 0 && <span className="block text-xs font-medium tabular-nums text-red-700">{cad(p.refundedCents)} refunded</span>}
                        </div>
                      </div>
                      {(canRemove || canRefund) && (
                        <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
                          {canRefund && (
                            <details className="open:basis-full">
                              <summary className="inline-flex min-h-8 items-center font-semibold text-blue hover:text-blue-deep">Refund</summary>
                              {route.via === "none" ? <p className="mt-1 max-w-[70ch] text-xs text-ink-soft">{route.why}</p> : (
                                <form action={paymentRefund} className="mt-2 space-y-2 rounded-lg bg-tint p-3">
                                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={here} /><input type="hidden" name="already" value={p.refundedCents} />
                                  <div className="grid items-end gap-3 sm:grid-cols-[9rem_1fr_auto]">
                                    <Field label="Refund ($)"><Input name="amount" type="number" step="0.01" min="0.01" max={left / 100} inputMode="decimal" defaultValue={(left / 100).toFixed(2)} required className="text-right tabular-nums" /></Field>
                                    <Field label="Reason (for your records)"><Input name="reason" maxLength={200} /></Field>
                                    <ConfirmButton message={route.via === "stripe" ? "Refund this to the client's card? This can't be undone." : "Record this refund? Remember to send the money back yourself."} className={btn("danger")}>Refund payment</ConfirmButton>
                                  </div>
                                  <p className="max-w-[70ch] text-xs text-ink-soft">
                                    {route.via === "stripe"
                                      ? `Goes back to the client's card (5 to 10 business days). The card processing fee is not returned to you.${p.tipCents ? " The tip is not included: refund a tip from your card payments account." : ""}`
                                      : `This only records the refund. Send the ${METHOD[p.method].toLowerCase()} back to the client yourself.`}
                                    {" "}The client is emailed a refund receipt, and the invoice shows the refunded amount as owing again.
                                  </p>
                                </form>
                              )}
                            </details>
                          )}
                          {canRemove && <form action={paymentDelete}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={here} /><ConfirmButton message="Remove this payment? The invoice will show the amount as owing again." className="inline-flex min-h-8 items-center font-semibold text-ink-soft hover:text-red-700">Remove</ConfirmButton></form>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-ink-soft">No payments yet.{canPay && inv.status !== "DRAFT" && " Record one above when the money arrives."}</p>}
            {inv.status !== "VOID" && inv.status !== "PAID" && (
              <form action={invoiceAllowPartial} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft pt-3 text-sm">
                <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="on" value={inv.allowPartial ? "0" : "1"} />
                <span className="min-w-0 flex-1 basis-56"><span className="font-medium">Online partial payments are {inv.allowPartial ? "on" : "off"}</span><span className="block text-xs text-ink-soft">{inv.allowPartial ? "The client can pay part of the balance by card." : "Card payments are for the full balance."}</span></span>
                <Button variant="secondary" className="min-h-9 px-3">{inv.allowPartial ? "Turn off" : "Turn on"}</Button>
              </form>
            )}
          </Card>

          {!autoTrouble && autoPayCard}

          <Card title="Details">
            <Dl rows={[
              ["Issued", inv.issuedOn ? prettyDate(dateOnly(inv.issuedOn)) : "Not sent yet"],
              ["Due", inv.dueOn ? prettyDate(dateOnly(inv.dueOn)) : null],
              ["Payment terms", TERMS_LABEL[inv.paymentTerms]],
              ["e-Transfer code", inv.etransferRef],
              ["Job", inv.job ? <Link className="text-blue hover:text-blue-deep" href={`/jobs/${inv.job.id}`}>#{inv.job.number} {inv.job.title}</Link> : null],
              ["Storm", inv.snowEvent ? <Link className="text-blue hover:text-blue-deep" href={`/snow/${inv.snowEvent.id}`}>{inv.snowEvent.name}</Link> : null],
              ["Reminders", inv.remindersSent ? `${inv.remindersSent} sent` : null],
              ["Void reason", inv.voidReason],
            ]} />
          </Card>
        </div>
        <div className="space-y-5"><SignatureCard where={{ invoiceId: inv.id }} signHref={`/sign/invoice/${inv.id}`} /><RecordPanel businessId={bid} target={{ invoiceId: inv.id }} clientId={inv.clientId} path={here} /></div>
      </div>
    </>
  );
}
