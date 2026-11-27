// Payments to match: money that arrived without an obvious invoice. Suggested invoices first; split across up to 3.
import Link from "next/link";
import { Flash } from "@/components/flash";
import { Badge, Button, Card, Empty, PageHeader, inputCls } from "@/components/ui";
import { suggestInvoices, type OpenInvoice } from "@/server/billing/unmatched";
import { dateOnly, prettyDateTime } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { unmatchedApply, unmatchedDismiss } from "./actions";

export const metadata = { title: "Payments to match" };

export default async function Unmatched({ searchParams }: PageProps<"/payments/unmatched">) {
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
      {sp.applied && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Applied. Receipts are on their way.</p>}
      <PageHeader title="Payments to match" sub="e-Transfers we couldn't tie to an invoice automatically. Pick the invoice (or split it), or dismiss it." actions={<Link href="/payments" className="text-sm font-semibold text-blue">All payments</Link>} />
      {items.length ? (
        <div className="space-y-4">
          {items.map((u) => {
            const used = u.payments.reduce((a, p) => a + p.amountCents, 0);
            const remaining = u.amountCents - used;
            const sugg = suggestInvoices(u, open);
            const first = sugg[0]?.invoice;
            const ordered = [...sugg.map((s) => s.invoice), ...open.filter((o) => !sugg.some((s) => s.invoice.id === o.id))];
            return (
              <Card key={u.id} className="scroll-mt-20">
                <div id={`u-${u.id}`} className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-2xl font-bold">{money(u.amountCents)}{used > 0 && <span className="ml-2 text-base font-normal text-ink-soft">{money(remaining)} left</span>}</div>
                    <div className="text-sm text-ink-soft">from <b className="text-navy">{u.sender ?? "unknown sender"}</b> · {prettyDateTime(u.receivedAt)}{u.providerRef && ` · Interac ${u.providerRef}`}</div>
                    {u.message && <p className="mt-1 rounded-lg bg-tint px-2 py-1 text-sm">“{u.message}”</p>}
                    {used > 0 && <p className="mt-1 text-xs text-ink-soft">Already applied to {u.payments.map((p) => `#${p.invoice.number}`).join(", ")}</p>}
                  </div>
                </div>
                {sugg.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                    {sugg.map((s) => (
                      <li key={s.invoice.id} className="rounded-xl border border-line px-3 py-1.5">
                        <b>#{s.invoice.number}</b> {s.invoice.clientName} · {money(s.invoice.balanceCents)} <span className="text-ink-soft">({s.reasons.join(", ")})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {open.length ? (
                  <form action={unmatchedApply} className="mt-4 space-y-2">
                    <input type="hidden" name="id" value={u.id} />
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
                        <select name={`alloc_${i}_invoice`} defaultValue={i === 0 ? first?.id ?? "" : ""} className={inputCls} aria-label={`Invoice ${i + 1}`}>
                          <option value="">{i === 0 ? "Choose an invoice…" : "Split: another invoice (optional)"}</option>
                          {ordered.map((o) => <option key={o.id} value={o.id}>#{o.number} {o.clientName}: {money(o.balanceCents)} owing</option>)}
                        </select>
                        <input name={`alloc_${i}_amount`} type="number" step="0.01" min="0" aria-label="Amount" placeholder="$"
                          defaultValue={i === 0 && first ? (Math.min(remaining, first.balanceCents) / 100).toFixed(2) : ""} className={inputCls} />
                      </div>
                    ))}
                    <Button>Apply &amp; send receipts</Button>
                  </form>
                ) : <p className="mt-3 text-sm text-ink-soft">No open invoices to apply it to. Create the invoice first, or dismiss this.</p>}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink-soft">Not for an invoice?</summary>
                  <form action={unmatchedDismiss} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="reason" placeholder="e.g. tip, refund back, personal" className={inputCls} maxLength={200} />
                    <Button variant="secondary">Dismiss</Button>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>
      ) : <Empty>Nothing to match. Every payment found its invoice.</Empty>}
      {recent.length > 0 && (
        <Card title="Recently handled" className="mt-5">
          <ul className="divide-y divide-line text-sm">
            {recent.map((u) => (
              <li key={u.id} className="flex justify-between gap-2 py-2">
                <span>{money(u.amountCents)} from {u.sender ?? "unknown"}</span>
                <span>{u.status === "APPLIED" ? <>→ {u.payments.map((p) => <Link key={p.invoice.id} className="text-blue" href={`/invoices/${p.invoice.id}`}>#{p.invoice.number} </Link>)}</> : <Badge>{u.dismissedReason ?? "Dismissed"}</Badge>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
