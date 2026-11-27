import Link from "next/link";
import { INVOICE_LABEL, InvoiceBadge } from "@/components/status";
import { ButtonLink, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { invoiceView, type InvoiceView } from "@/server/billing/invoice";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Invoices" };
const TABS: (InvoiceView | "OPEN" | "ALL")[] = ["OPEN", "DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID", "VOID", "ALL"];
const label = (t: (typeof TABS)[number]) => (t === "OPEN" ? "Unpaid" : t === "ALL" ? "All" : INVOICE_LABEL[t]);

export default async function Invoices({ searchParams }: PageProps<"/invoices">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "OPEN";
  const today = todayLocal();
  const all = (await db.invoice.findMany({ where: { businessId: await businessId() }, include: { client: true }, orderBy: { number: "desc" }, take: 500 }))
    .map((i) => ({ ...i, view: invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today) }));
  const match = (t: (typeof TABS)[number], v: InvoiceView) =>
    t === "ALL" || (t === "OPEN" ? ["DRAFT", "AWAITING_PAYMENT", "PARTIAL", "PAST_DUE"].includes(v) : t === "AWAITING_PAYMENT" ? v === t || v === "PARTIAL" : v === t);
  const rows = all.filter((i) => match(tab, i.view));
  const owing = all.filter((i) => ["AWAITING_PAYMENT", "PARTIAL", "PAST_DUE"].includes(i.view)).reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0);
  return (
    <>
      <PageHeader title="Invoices" sub={`${money(owing)} owing`} actions={<><ButtonLink href="/billing" variant="primary">Billing run</ButtonLink><ButtonLink href="/payments">Payments</ButtonLink></>} />
      <Tabs active={label(tab)} items={TABS.map((t) => ({ href: `/invoices?tab=${t}`, label: label(t), count: all.filter((i) => match(t, i.view)).length }))} />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id}>
                <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0"><span className="font-semibold">#{i.number} {clientName(i.client)}</span>
                    <span className="block truncate text-sm text-ink-soft">{i.subject} · {i.issuedOn ? `issued ${prettyDate(dateOnly(i.issuedOn))}` : "not sent"}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><span className="font-semibold">{money(i.totalCents)}</span><InvoiceBadge s={i.view} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No invoices here.</Empty>}
      </Card>
    </>
  );
}
