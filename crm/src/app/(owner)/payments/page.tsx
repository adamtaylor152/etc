import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { fromLocalInput, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Payments" };
const METHOD: Record<string, string> = { CASH: "Cash", ETRANSFER: "e-Transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" };

export default async function Payments() {
  await requireOwner();
  const bid = await businessId();
  const toMatch = await db.unmatchedPayment.count({ where: { businessId: bid, status: "OPEN" } });
  const payments = await db.payment.findMany({ where: { businessId: bid }, include: { client: true, invoice: true }, orderBy: { receivedAt: "desc" }, take: 300 });
  const year = todayLocal().slice(0, 4);
  // Totals come from the database, not from the 300 rows listed below.
  const sums = await db.payment.groupBy({ by: ["method"], where: { businessId: bid, receivedAt: { gte: fromLocalInput(`${year}-01-01T00:00`)!, lt: fromLocalInput(`${Number(year) + 1}-01-01T00:00`)! } }, _sum: { amountCents: true, refundedCents: true } });
  const byMethod = sums.map((s) => [s.method, (s._sum.amountCents ?? 0) - (s._sum.refundedCents ?? 0)] as const).filter(([, c]) => c !== 0);
  return (
    <>
      <PageHeader title="Payments" sub={`${money(byMethod.reduce((a, [, c]) => a + c, 0))} received in ${year}`}
        actions={<>{toMatch > 0 && <Link href="/payments/unmatched" className="inline-flex min-h-11 items-center rounded-full border-2 border-amber-300 bg-amber-50 px-5 text-sm font-semibold text-amber-900">{toMatch} to match</Link>}<a href={`/api/export/payments?from=${year}-01-01&to=${year}-12-31`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">Download {year} CSV</a></>} />
      {byMethod.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {byMethod.map(([m, c]) => <div key={m} className="rounded-2xl border border-line bg-white p-4"><div className="font-display text-2xl font-bold">{money(c)}</div><div className="text-sm text-ink-soft">{METHOD[m]}</div></div>)}
        </div>
      )}
      <Card>
        {payments.length ? (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id}>
                <Link href={`/invoices/${p.invoiceId}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span><span className="font-semibold">{clientName(p.client)}</span><span className="block text-ink-soft">Invoice #{p.invoice.number} · {METHOD[p.method]} · {prettyDateTime(p.receivedAt)}</span></span>
                  <span className="font-semibold">{money(p.amountCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No payments yet.</Empty>}
      </Card>
    </>
  );
}
