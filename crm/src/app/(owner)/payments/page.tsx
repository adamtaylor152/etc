import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Download } from "lucide-react";
import { Amount } from "@/components/billing/money";
import { Pager, pageOf } from "@/components/list-page";
import { ButtonLink, Card, Empty, PageHeader, Stat, btn } from "@/components/ui";
import { fromLocalInput, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Payments" };
const METHOD: Record<string, string> = { CASH: "Cash", ETRANSFER: "e-Transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" };

export default async function Payments({ searchParams }: PageProps<"/payments">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const toMatch = await db.unmatchedPayment.count({ where: { businessId: bid, status: "OPEN" } });
  const at = pageOf(typeof sp.page === "string" ? sp.page : undefined, await db.payment.count({ where: { businessId: bid } }));
  const payments = await db.payment.findMany({ where: { businessId: bid }, include: { client: true, invoice: true }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], skip: at.skip, take: at.take });
  const year = todayLocal().slice(0, 4);
  // Totals come from the database, not from the page of rows listed below.
  const sums = await db.payment.groupBy({ by: ["method"], where: { businessId: bid, receivedAt: { gte: fromLocalInput(`${year}-01-01T00:00`)!, lt: fromLocalInput(`${Number(year) + 1}-01-01T00:00`)! } }, _sum: { amountCents: true, refundedCents: true, tipCents: true } });
  const tips = sums.reduce((a, x) => a + (x._sum.tipCents ?? 0), 0); // shown on their own: never part of invoice money
  const byMethod = sums.map((s) => [s.method, (s._sum.amountCents ?? 0) - (s._sum.refundedCents ?? 0)] as const).filter(([, c]) => c !== 0);
  const received = byMethod.reduce((a, [, c]) => a + c, 0);
  return (
    <>
      <PageHeader title="Payments" sub="Every payment recorded against an invoice, newest first."
        actions={<>
          {toMatch === 0 && <ButtonLink href="/payments/unmatched">e-Transfers to match</ButtonLink>}
          <a href={`/api/export/payments?from=${year}-01-01&to=${year}-12-31`} className={btn("secondary")}><Download className="size-4" strokeWidth={1.75} aria-hidden />Download {year} CSV</a>
        </>} />
      {toMatch > 0 && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p><span className="font-semibold">{toMatch} e-Transfer{toMatch === 1 ? "" : "s"} to match.</span> Money arrived that we couldn&apos;t tie to an invoice automatically.</p>
          <ButtonLink href="/payments/unmatched" variant="primary">Match payments</ButtonLink>
        </div>
      )}
      {byMethod.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={`Received in ${year}`} value={money(received)} sub="after refunds" />
          {byMethod.map(([m, c]) => <Stat key={m} label={METHOD[m]} value={money(c)} sub={received > 0 ? `${Math.round((100 * c) / received)}% of the year` : undefined} />)}
          {tips > 0 && <Stat label="Tips" value={money(tips)} sub="on top, not invoice money" />}
        </div>
      )}
      {payments.length ? (
        <Card className="overflow-hidden p-0!">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium text-ink-soft">
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Invoice</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Method</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Received</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {payments.map((p) => (
                <tr key={p.id} className="relative align-top hover:bg-tint">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${p.invoiceId}`} className="font-semibold after:absolute after:inset-0">{clientName(p.client)}</Link>
                    <span className="block text-xs tabular-nums text-ink-soft sm:hidden">Invoice #{p.invoice.number} · {METHOD[p.method]} · {prettyDateTime(p.receivedAt)}</span>
                    <span className="hidden text-xs text-ink-soft sm:block md:hidden">{METHOD[p.method]}</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums sm:table-cell">#{p.invoice.number}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{METHOD[p.method]}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-ink-soft sm:table-cell">{prettyDateTime(p.receivedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Amount cents={p.amountCents} className="font-semibold" />
                    {p.tipCents ? <span className="block whitespace-nowrap text-xs tabular-nums text-ink-soft">plus {money(p.tipCents)} tip</span> : null}
                    {p.refundedCents > 0 && <span className="block whitespace-nowrap text-xs font-medium tabular-nums text-red-700">{money(p.refundedCents)} refunded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager base="/payments" params={{}} at={at} />
        </Card>
      ) : <Empty action={<ButtonLink href="/invoices">Go to invoices</ButtonLink>}>No payments yet. Record one from an invoice when money arrives.</Empty>}
    </>
  );
}
