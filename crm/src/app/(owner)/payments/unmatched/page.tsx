// Payments to match: money that arrived without an obvious invoice. Suggested invoices first; split across up to 3.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Flash } from "@/components/flash";
import { Amount, cad } from "@/components/billing/money";
import { Badge, Button, ButtonLink, Card, Empty, Notice, PageHeader, inputCls, type Tone } from "@/components/ui";
import { suggestInvoices, type OpenInvoice } from "@/server/billing/unmatched";
import { dateOnly, prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { unmatchedApply, unmatchedDismiss } from "./actions";

export const metadata = { title: "Payments to match" };

// The matcher's score, said in words (see suggestInvoices: same amount 50, last name 35, invoice number 30, name or email 20).
const strength = (score: number): [string, Tone] => (score >= 80 ? ["Strong match", "green"] : score >= 50 ? ["Likely match", "blue"] : ["Possible match", "gray"]);
const WHY: Record<string, string> = {
  "same amount": "the amount is exactly what is owing",
  "payment covers it": "the payment covers the balance",
  "same last name": "the sender has the same last name",
  "name match": "part of the name matches",
  "email in message": "the message has their email",
};
const why = (reasons: string[]) => {
  const parts = reasons.map((r) => WHY[r] ?? (r.startsWith("mentions ") ? `the message ${r}` : r));
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
  return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : "";
};

export default async function Unmatched({ searchParams }: PageProps<"/payments/unmatched">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const [items, invoices, recent] = await Promise.all([
    db.unmatchedPayment.findMany({ where: { businessId: bid, status: "OPEN" }, include: { payments: { select: { amountCents: true, invoice: { select: { number: true } } } } }, orderBy: { receivedAt: "desc" } }),
    db.invoice.findMany({ where: { businessId: bid, status: { in: ["DRAFT", "AWAITING_PAYMENT"] } }, include: { client: true }, orderBy: { number: "desc" } }),
    db.unmatchedPayment.findMany({ where: { businessId: bid, status: { not: "OPEN" } }, include: { payments: { select: { invoice: { select: { id: true, number: true } } } } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);
  const open: OpenInvoice[] = invoices.map((i) => ({
    id: i.id, number: i.number, etransferRef: i.etransferRef, balanceCents: i.totalCents - i.amountPaidCents, clientName: clientName(i.client), email: i.client.email, issuedOn: dateOnly(i.issuedOn),
  })).filter((i) => i.balanceCents > 0);
  return (
    <>
      <Flash error={sp.error} />
      {sp.applied && <Notice tone="good">Applied. Receipts are on their way.</Notice>}
      <PageHeader title="Payments to match" sub="e-Transfers we couldn't tie to an invoice automatically. Match each one to its invoice, split it across invoices, or dismiss it."
        actions={<ButtonLink href="/payments">All payments</ButtonLink>} />
      {items.length ? (
        <div className="max-w-4xl space-y-5">
          {items.map((u, at) => {
            const used = u.payments.reduce((a, p) => a + p.amountCents, 0);
            const remaining = u.amountCents - used;
            const sugg = suggestInvoices(u, open);
            const first = sugg[0]?.invoice;
            const ordered = [...sugg.map((s) => s.invoice), ...open.filter((o) => !sugg.some((s) => s.invoice.id === o.id))];
            return (
              <Card key={u.id} className="scroll-mt-20">
                <div id={`u-${u.id}`} className="flex scroll-mt-20 flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-[0.95rem] font-semibold">{u.sender ?? "Unknown sender"}</h2>
                    <p className="text-sm tabular-nums text-ink-soft">Received {prettyDateTime(u.receivedAt)}{u.providerRef && ` · Interac ${u.providerRef}`}</p>
                  </div>
                  <div className="text-right">
                    <div data-money className="font-display text-[1.7rem] font-semibold leading-none tabular-nums">{cad(u.amountCents)}</div>
                    {used > 0 && <p className="mt-1 text-xs font-medium tabular-nums text-amber-800">{cad(remaining)} left to match</p>}
                  </div>
                </div>
                {u.message && <p className="mt-3 max-w-[70ch] rounded-lg bg-tint px-3 py-2 text-sm"><span className="mb-0.5 block text-xs font-medium text-ink-soft">Message from the sender</span>{u.message}</p>}
                {used > 0 && <p className="mt-2 text-xs tabular-nums text-ink-soft">Already applied to {u.payments.map((p) => `#${p.invoice.number} (${cad(p.amountCents)})`).join(", ")}</p>}

                {sugg.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1 text-xs font-medium text-ink-soft">Suggested invoice{sugg.length === 1 ? "" : "s"}, best match first</h3>
                    <ol className="divide-y divide-line-soft border-y border-line-soft">
                      {sugg.map((s, n) => {
                        const [label, tone] = strength(s.score);
                        const apply = Math.min(remaining, s.invoice.balanceCents);
                        return (
                          <li key={s.invoice.id} className="grid grid-cols-1 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[1fr_auto_auto]">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Link href={`/invoices/${s.invoice.id}`} className="font-semibold hover:text-blue-deep"><span className="tabular-nums">#{s.invoice.number}</span> {s.invoice.clientName}</Link>
                                <Badge tone={tone}>{label}</Badge>
                              </div>
                              <p className="mt-0.5 max-w-[60ch] text-sm text-ink-soft">{why(s.reasons)}</p>
                            </div>
                            <div className="flex items-center justify-between gap-4 sm:contents">
                            <div className="text-xs text-ink-soft sm:text-right"><Amount cents={s.invoice.balanceCents} className="mr-1 text-sm font-semibold text-navy sm:mr-0 sm:block" />owing</div>
                            <form action={unmatchedApply}>
                              <input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="alloc_0_invoice" value={s.invoice.id} />
                              <input type="hidden" name="alloc_0_amount" value={(apply / 100).toFixed(2)} />
                              <Button variant={at === 0 && n === 0 ? "primary" : "secondary"} title={`Applies ${cad(apply)} to invoice #${s.invoice.number} and emails the receipt`}>Match<span className="sr-only"> to invoice #{s.invoice.number}</span></Button>
                            </form>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="mt-1.5 text-xs text-ink-soft">Match applies the payment to that invoice (up to what is owing) and emails the client a receipt.</p>
                  </div>
                )}

                {open.length ? (
                  <details className="mt-3" open={sugg.length === 0}>
                    <summary className="inline-flex min-h-9 items-center text-sm font-semibold text-blue hover:text-blue-deep">{sugg.length ? "Split it, or pick another invoice" : "Pick the invoice, or split it"}</summary>
                    <form action={unmatchedApply} className="mt-2 rounded-lg bg-tint p-3">
                      <input type="hidden" name="id" value={u.id} />
                      <div className="mb-1 grid grid-cols-[1fr_7rem] gap-2 text-xs font-medium text-ink-soft"><span>Invoice</span><span className="text-right">Amount ($)</span></div>
                      <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
                            <select name={`alloc_${i}_invoice`} defaultValue={i === 0 ? first?.id ?? "" : ""} className={inputCls} aria-label={`Invoice ${i + 1}`}>
                              <option value="">{i === 0 ? "Choose an invoice…" : "Split: another invoice (optional)"}</option>
                              {ordered.map((o) => <option key={o.id} value={o.id}>#{o.number} {o.clientName}: {money(o.balanceCents)} owing</option>)}
                            </select>
                            <input name={`alloc_${i}_amount`} type="number" step="0.01" min="0" inputMode="decimal" aria-label={`Amount for invoice ${i + 1}`} placeholder="0.00"
                              defaultValue={i === 0 && first ? (Math.min(remaining, first.balanceCents) / 100).toFixed(2) : ""} className={`${inputCls} text-right tabular-nums`} />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs tabular-nums text-ink-soft">Up to three invoices. {cad(remaining)} to share out.</span>
                        <Button variant={sugg.length === 0 && at === 0 ? "primary" : "secondary"}>Apply and send receipts</Button>
                      </div>
                    </form>
                  </details>
                ) : <p className="mt-3 text-sm text-ink-soft">No open invoices to apply it to. Create the invoice first, or dismiss this.</p>}
                <details className="mt-1">
                  <summary className="inline-flex min-h-9 items-center text-sm font-semibold text-ink-soft hover:text-navy">Not for an invoice?</summary>
                  <form action={unmatchedDismiss} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="reason" placeholder="e.g. tip, refund back, personal" aria-label="Why it is not for an invoice" className={`${inputCls} min-w-0 flex-1 basis-56`} maxLength={200} />
                    <Button variant="secondary">Dismiss payment</Button>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
      ) : <div className="max-w-4xl"><Empty>Nothing to match. Every payment found its invoice. New e-Transfers that can&apos;t be tied to an invoice will wait here.</Empty></div>}
      {recent.length > 0 && (
        <Card title="Recently handled" className="mt-5 max-w-4xl">
          <ul className="divide-y divide-line-soft text-sm">
            {recent.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 basis-40 truncate">{u.sender ?? "Unknown sender"}</span>
                <span className="text-ink-soft">{u.status === "APPLIED" ? <>Applied to {u.payments.map((p, i) => <span key={p.invoice.id}>{i > 0 && ", "}<Link className="font-semibold tabular-nums text-blue hover:text-blue-deep" href={`/invoices/${p.invoice.id}`}>#{p.invoice.number}</Link></span>)}</> : <Badge>{u.dismissedReason ?? "Dismissed"}</Badge>}</span>
                <Amount cents={u.amountCents} className="w-24 text-right font-medium" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
