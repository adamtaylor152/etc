import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Payments" };
const METHOD: Record<string, string> = { CASH: "Cash", ETRANSFER: "e-Transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" };

export default async function Payments() {
  const bid = await businessId();
  const payments = await db.payment.findMany({ where: { businessId: bid }, include: { client: true, invoice: true }, orderBy: { receivedAt: "desc" }, take: 300 });
  const year = todayLocal().slice(0, 4);
  const thisYear = payments.filter((p) => p.receivedAt.toISOString().startsWith(year));
  const byMethod = Object.entries(thisYear.reduce<Record<string, number>>((a, p) => ({ ...a, [p.method]: (a[p.method] ?? 0) + p.amountCents - p.refundedCents }), {}));
  return (
    <>
      <PageHeader title="Payments" sub={`${money(thisYear.reduce((a, p) => a + p.amountCents - p.refundedCents, 0))} received in ${year}`}
        actions={<a href={`/api/export/payments?from=${year}-01-01&to=${year}-12-31`} className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-white px-5 text-sm font-semibold">Download {year} CSV</a>} />
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
