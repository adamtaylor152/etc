// Billing run: everything done but not yet invoiced -> drafts -> review -> send the ticked ones.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Flash } from "@/components/flash";
import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { dateOnly, prettyDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { invoiceCreate, runBilling, sendDrafts } from "../billing-actions";

export const metadata = { title: "Billing" };

export default async function Billing({ searchParams }: PageProps<"/billing">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const [charges, drafts, fixedDone] = await Promise.all([
    db.visitCharge.findMany({
      where: { businessId: bid, invoiceLineItemId: null },
      include: { visit: { include: { job: { include: { client: true } }, snowEvent: true } } }, orderBy: { createdAt: "asc" },
    }),
    db.invoice.findMany({ where: { businessId: bid, status: "DRAFT" }, include: { client: true }, orderBy: { number: "asc" } }),
    // Fixed-price jobs with every visit done and no invoice yet.
    db.job.findMany({
      where: { businessId: bid, billingType: "FIXED_PRICE", kind: { not: "RECURRING" }, closedAt: null, invoices: { none: { status: { not: "VOID" } } }, visits: { some: {}, every: { state: { in: ["COMPLETED", "SKIPPED", "CANCELLED"] } } } },
      include: { client: true },
    }),
  ]);
  const byClient = new Map<string, typeof charges>();
  for (const c of charges) byClient.set(c.visit.job.clientId, [...(byClient.get(c.visit.job.clientId) ?? []), c]);
  const unbilled = charges.reduce((a, c) => a + c.totalCents, 0);
  return (
    <>
      <Flash error={sp.error} />
      {sp.made && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{String(sp.made)} draft invoice(s) created. Review below, then send.</p>}
      {sp.sent && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{String(sp.sent)} invoice(s) sent.</p>}
      <PageHeader title="Billing" sub={`${money(unbilled)} done but not invoiced`} actions={
        byClient.size > 0 && <form action={runBilling}><Button>Create drafts for everyone</Button></form>
      } />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Not invoiced yet (${byClient.size} client${byClient.size === 1 ? "" : "s"})`}>
          {byClient.size ? (
            <ul className="divide-y divide-line">
              {[...byClient.entries()].map(([clientId, list]) => (
                <li key={clientId} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link className="font-semibold text-blue" href={`/clients/${clientId}`}>{clientName(list[0].visit.job.client)}</Link>
                    <span className="font-semibold">{money(list.reduce((a, c) => a + c.totalCents, 0))}</span>
                  </div>
                  <ul className="mt-1 text-sm text-ink-soft">
                    {list.map((c) => <li key={c.id}>{prettyDate(dateOnly(c.visit.scheduledDate))} · {c.name}{c.visit.snowEvent ? ` (${c.visit.snowEvent.name})` : ""} · {money(c.totalCents)}</li>)}
                  </ul>
                  <form action={invoiceCreate} className="mt-2"><input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="back" value="/billing" /><Button variant="secondary">Invoice {list[0].visit.job.client.firstName}</Button></form>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing waiting. Charges appear here when visits are marked done.</Empty>}
          {fixedDone.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-sm font-semibold">Fixed-price jobs ready to invoice</p>
              {fixedDone.map((j) => (
                <form key={j.id} action={invoiceCreate} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <input type="hidden" name="jobId" value={j.id} /><input type="hidden" name="fixed" value="1" /><input type="hidden" name="back" value="/billing" />
                  <span>#{j.number} {j.title} · {clientName(j.client)} · {money(j.totalCents ?? 0)}</span><Button variant="secondary">Invoice</Button>
                </form>
              ))}
            </div>
          )}
        </Card>
        <Card title={`Drafts (${drafts.length})`} actions={drafts.length > 0 && <Button form="send-drafts">Send ticked</Button>}>
          {drafts.length ? (
            <form id="send-drafts" action={sendDrafts}>
              <input type="hidden" name="back" value="/billing" />
              <ul className="divide-y divide-line">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center gap-3">
                    <input type="checkbox" name="id" value={d.id} defaultChecked aria-label={`Send invoice #${d.number}`} className="size-5 shrink-0 accent-blue" />
                    <Link href={`/invoices/${d.id}`} className="flex flex-1 justify-between gap-2 py-2.5"><span><span className="font-semibold">#{d.number} {clientName(d.client)}</span><span className="block text-sm text-ink-soft">{d.subject}</span></span><span className="font-semibold">{money(d.totalCents)}</span></Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-soft">Untick any you want to hold back. Open a draft to edit it first.</p>
            </form>
          ) : <Empty>No drafts.</Empty>}
        </Card>
      </div>
    </>
  );
}
