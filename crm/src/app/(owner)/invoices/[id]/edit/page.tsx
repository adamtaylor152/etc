// Edit a draft invoice: lines, discount, payment terms, message. Sent invoices are locked (void and re-issue).
import { requireOwner } from "@/server/auth";
import { notFound, redirect } from "next/navigation";
import { Amount } from "@/components/billing/money";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { LineItems } from "@/components/line-items";
import { Badge, Button, ButtonLink, Card, Field, Input, Textarea, inputCls } from "@/components/ui";
import { TERMS_LABEL, isCreditLine } from "@/server/billing/invoice";
import { dateOnly } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { invoiceUpdate } from "../../../billing-actions";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoice({ params, searchParams }: PageProps<"/invoices/[id]/edit">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const inv = await db.invoice.findFirst({ where: { id, businessId: bid }, include: { client: true, lineItems: { orderBy: { sortOrder: "asc" }, include: { charge: true } } } });
  if (!inv) notFound();
  const here = `/invoices/${id}`;
  if (inv.status !== "DRAFT" || inv.kind === "DEPOSIT") redirect(here);
  const services = await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });
  const credits = inv.lineItems.filter(isCreditLine);
  return (
    <>
      <Flash error={sp.error} />
      <DetailHeader back={{ href: here, label: `Invoice #${inv.number}` }} kind="Invoice" status={<Badge>Draft</Badge>} title={`Edit invoice #${inv.number}`} sub={<>For {clientName(inv.client)}{inv.subject && <> · {inv.subject}</>}</>} />
      <Card className="max-w-3xl">
        <form action={invoiceUpdate} className="space-y-5">
          <input type="hidden" name="id" value={inv.id} /><input type="hidden" name="back" value={`${here}/edit`} />
          <div>
            <LineItems dated services={services.map((sv) => ({ id: sv.id, name: sv.name, unitPriceCents: sv.unitPriceCents }))} initial={inv.lineItems.filter((l) => !isCreditLine(l)).map((l) => ({
              id: l.id, name: l.name, desc: l.description ?? "", qty: String(Number(l.quantity)), price: (l.unitPriceCents / 100).toFixed(2), date: dateOnly(l.serviceDate) ?? "",
              note: l.charge ? `From a visit (charged ${money(l.charge.totalCents)}). Remove it and the visit goes back to unbilled.` : undefined,
            }))} />
            <p className="mt-2 max-w-[70ch] text-xs text-ink-soft">To remove a line, use the bin or clear its name. Changing a visit line&apos;s price changes this invoice only; the visit still counts as billed.</p>
          </div>
          {credits.length > 0 && (
            <div className="rounded-lg bg-tint p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-ink-soft">Deposits and credits applied</p>
              <ul className="divide-y divide-line-soft">{credits.map((c) => <li key={c.id} className="flex justify-between gap-3 py-1.5"><span>{c.name}</span><Amount cents={c.totalCents} className="font-medium" /></li>)}</ul>
              <p className="mt-1.5 max-w-[70ch] text-xs text-ink-soft">Deposit and credit lines can&apos;t be edited: each one uses up a paid deposit or an account credit.</p>
            </div>
          )}
          <div className="grid gap-3 border-t border-line-soft pt-5 sm:grid-cols-2">
            <Field label="Discount ($)"><Input name="discount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={inv.discountCents ? (inv.discountCents / 100).toFixed(2) : ""} placeholder="0.00" className="tabular-nums" /></Field>
            <Field label="Payment terms" hint="The due date is set when the invoice is sent.">
              <select name="paymentTerms" defaultValue={inv.paymentTerms} className={inputCls}>{Object.entries(TERMS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
          </div>
          <Field label="Message to the client (optional)" hint="Shown on the invoice email and the invoice page."><Textarea name="message" rows={3} maxLength={2000} defaultValue={inv.message ?? ""} /></Field>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4"><Button>Save draft</Button><ButtonLink href={here}>Cancel</ButtonLink><span className="text-xs text-ink-soft">Nothing is sent until you send the invoice.</span></div>
        </form>
      </Card>
    </>
  );
}
