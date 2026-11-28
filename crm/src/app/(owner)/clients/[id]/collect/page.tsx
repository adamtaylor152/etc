// Collect payment (Jobber's modal as a page): method, date, reference, and an amount per open invoice.
import { requireOwner } from "@/server/auth";
import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { Field, Input } from "@/components/ui";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { collectPayments } from "../../../work2-actions";

export const metadata = { title: "Collect payment" };

export default async function Collect({ params, searchParams }: PageProps<"/clients/[id]/collect">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const c = await db.client.findFirst({ where: { id, businessId: bid }, include: { invoices: { where: { status: { in: ["AWAITING_PAYMENT", "DRAFT"] } }, orderBy: { number: "asc" } } } });
  if (!c) notFound();
  const open = c.invoices.filter((i) => i.totalCents > i.amountPaidCents);
  const only = typeof sp.invoice === "string" ? sp.invoice : null;
  const sel = "min-h-10 w-full rounded-lg border border-line bg-white px-3";
  return (
    <>
      <DetailHeader back={{ href: `/clients/${id}`, label: clientName(c) }} title="Collect payment" sub={clientName(c)} />
      <form action={collectPayments} className="max-w-3xl space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
        <input type="hidden" name="clientId" value={id} />
        {typeof sp.error === "string" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Method"><select name="method" className={sel} defaultValue={c.preferredPayment ?? "ETRANSFER"}><option value="ETRANSFER">e-Transfer</option><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option><option value="CARD">Card (taken elsewhere)</option><option value="OTHER">Other</option></select></Field>
          <Field label="Date received"><Input name="date" type="date" defaultValue={todayLocal()} /></Field>
          <Field label="Reference"><Input name="reference" placeholder="e-Transfer ref, cheque #" /></Field>
        </div>
        {open.length ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-soft"><th className="py-2 font-semibold">Invoice</th><th className="font-semibold">Due</th><th className="text-right font-semibold">Total</th><th className="text-right font-semibold">Balance</th><th className="w-36 text-right font-semibold">Amount $</th></tr></thead>
            <tbody>
              {open.map((i) => {
                const bal = i.totalCents - i.amountPaidCents;
                return (
                  <tr key={i.id} className="border-b border-line/60">
                    <td className="py-2 font-semibold">#{i.number} {i.subject}{i.status === "DRAFT" && <span className="ml-1 text-xs text-ink-soft">(draft)</span>}<input type="hidden" name="invoiceId" value={i.id} /></td>
                    <td className="text-ink-soft">{i.dueOn ? prettyDate(dateOnly(i.dueOn)) : "—"}</td>
                    <td className="text-right">{money(i.totalCents)}</td>
                    <td className="text-right font-semibold">{money(bal)}</td>
                    <td className="py-2 pl-2"><input name={`amount_${i.id}`} type="number" step="0.01" min="0" max={bal / 100} defaultValue={!only || only === i.id ? (bal / 100).toFixed(2) : ""} aria-label={`Amount for invoice ${i.number}`} className="min-h-9 w-full rounded-lg border border-line px-2 text-right" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-sm text-ink-soft">No open invoices for {c.firstName}. Create an invoice first.</p>}
        <Field label="Note (optional)"><Input name="note" /></Field>
        <p className="text-xs text-ink-soft">A receipt email goes out for each payment. Paid-in-full invoices close automatically.</p>
        <button disabled={!open.length} className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white disabled:opacity-50">Save payment</button>
      </form>
    </>
  );
}
