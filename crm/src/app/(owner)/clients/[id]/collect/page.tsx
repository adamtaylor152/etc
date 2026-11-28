// Collect payment (Jobber's modal as a page): method, date, reference, and an amount per open invoice.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, ButtonLink, Card, Empty, Field, Input, inputCls } from "@/components/ui";
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
  const owing = open.reduce((n, i) => n + i.totalCents - i.amountPaidCents, 0);
  const th = "py-2 text-xs font-medium text-ink-soft";
  return (
    <>
      <DetailHeader back={{ href: `/clients/${id}`, label: clientName(c) }} title="Collect payment" sub={<>From {clientName(c)}{open.length > 0 && <> · <span className="tabular-nums">{money(owing)}</span> owing on {open.length} open invoice{open.length === 1 ? "" : "s"}</>}</>} />
      <form action={collectPayments} className="max-w-3xl">
        <input type="hidden" name="clientId" value={id} />
        <Flash error={sp.error} />
        <Card className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Method"><select name="method" className={inputCls} defaultValue={c.preferredPayment ?? "ETRANSFER"}><option value="ETRANSFER">e-Transfer</option><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option><option value="CARD">Card (taken elsewhere)</option><option value="OTHER">Other</option></select></Field>
            <Field label="Date received"><Input name="date" type="date" defaultValue={todayLocal()} /></Field>
            <Field label="Reference"><Input name="reference" placeholder="e-Transfer ref, cheque #" /></Field>
          </div>
          <section aria-labelledby="open-h">
            <h2 id="open-h" className="mb-1 font-display text-[0.95rem] font-semibold">Open invoices</h2>
            {open.length ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left"><th className={`${th} pr-3`}>Invoice</th><th className={`${th} hidden pr-3 sm:table-cell`}>Due</th><th className={`${th} hidden text-right sm:table-cell`}>Total</th><th className={`${th} pl-3 text-right`}>Balance</th><th className={`${th} w-28 pl-3 text-right sm:w-36`}>Amount ($)</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {open.map((i) => {
                    const bal = i.totalCents - i.amountPaidCents;
                    return (
                      <tr key={i.id}>
                        <td className="py-2.5 pr-3"><span className="font-semibold tabular-nums">#{i.number}</span> {i.subject}{i.status === "DRAFT" && <span className="ml-1 text-xs text-ink-soft">(draft)</span>}<input type="hidden" name="invoiceId" value={i.id} />
                          <span className="block text-xs text-ink-soft sm:hidden">{i.dueOn ? `Due ${prettyDate(dateOnly(i.dueOn))}` : "No due date"}</span></td>
                        <td className="hidden whitespace-nowrap pr-3 text-ink-soft sm:table-cell">{i.dueOn ? prettyDate(dateOnly(i.dueOn)) : <span className="text-ink-faint">—</span>}</td>
                        <td className="hidden whitespace-nowrap text-right text-ink-soft sm:table-cell">{money(i.totalCents)}</td>
                        <td className="whitespace-nowrap pl-3 text-right font-semibold">{money(bal)}</td>
                        <td className="py-2 pl-3"><input name={`amount_${i.id}`} type="number" step="0.01" min="0" max={bal / 100} defaultValue={!only || only === i.id ? (bal / 100).toFixed(2) : ""} aria-label={`Amount for invoice ${i.number}`} className={`${inputCls} text-right tabular-nums`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <Empty action={<ButtonLink href={`/invoices/new?client=${id}`}>New invoice</ButtonLink>}>No open invoices for {c.firstName}. Create an invoice first.</Empty>}
          </section>
          <Field label="Note (optional)"><Input name="note" /></Field>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 border-t border-line-soft pt-4">
            <p className="mr-auto max-w-[52ch] text-xs text-ink-soft">A receipt email goes out for each payment. Paid-in-full invoices close automatically.</p>
            <Link href={`/clients/${id}`} className="inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-ink-soft hover:text-navy">Cancel</Link>
            <Button disabled={!open.length} title={open.length ? undefined : "There are no open invoices to pay"}>Save payment</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
