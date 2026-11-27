import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { QUOTE } from "@/components/status";
import { Gallery } from "@/components/gallery";
import { QuoteLinesEditor } from "@/components/quote-lines";
import { Timeline } from "@/components/timeline";
import { Badge, Button, Card, Dl, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { quoteEditable, quoteExpired } from "@/server/status/quote";
import { quoteArchive, quoteConvert, quoteMarkApproved, quoteSend, quoteUpdate, quoteViewAsClient } from "../../quote-actions";

export default async function QuotePage({ params, searchParams }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const q = await db.quote.findFirst({ where: { id, businessId: bid }, include: { client: true, property: true, request: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!q) notFound();
  const [services, photos, events] = await Promise.all([
    db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }),
    db.attachment.findMany({ where: { businessId: bid, deletedAt: null, OR: [{ quoteId: id }, ...(q.requestId ? [{ requestId: q.requestId }] : [])] }, orderBy: { createdAt: "asc" } }),
    db.activityEvent.findMany({ where: { businessId: bid, entityType: "Quote", entityId: id }, orderBy: { at: "desc" } }),
  ]);
  const editable = quoteEditable(q.status);
  const here = `/quotes/${id}`;
  const hidden = <><input type="hidden" name="id" value={q.id} /><input type="hidden" name="back" value={here} /></>;
  const expired = quoteExpired({ status: q.status, validUntil: dateOnly(q.validUntil) }, todayLocal());
  return (
    <>
      <Flash error={sp.error} />
      {sp.sent && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Quote emailed to {q.client.email}.</p>}
      {q.status === "CHANGES_REQUESTED" && q.changeRequestMessage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><b>{q.client.firstName} asked for changes:</b><p className="mt-1 whitespace-pre-line">{q.changeRequestMessage}</p></div>
      )}
      <PageHeader
        title={<>Quote #{q.number} {expired ? <Badge tone="red">Expired</Badge> : <Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge>}</>}
        sub={<><Link className="font-semibold text-blue" href={`/clients/${q.clientId}`}>{clientName(q.client)}</Link>{q.property && ` · ${q.property.formatted}`}{q.request && <> · <Link className="text-blue" href={`/requests/${q.request.id}`}>request #{q.request.number}</Link></>}</>}
        actions={<>
          {!editable && (q.status === "AWAITING_RESPONSE") && <form action={quoteSend}>{hidden}<Button variant="secondary">Resend</Button></form>}
          {(q.status === "AWAITING_RESPONSE" || q.status === "CHANGES_REQUESTED") && <form action={quoteMarkApproved}>{hidden}<Button variant="secondary">Mark approved</Button></form>}
          {q.status !== "DRAFT" && <form action={quoteViewAsClient}>{hidden}<Button variant="secondary">Client view</Button></form>}
          {q.jobId && <Link href={`/jobs/${q.jobId}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-blue bg-blue px-5 text-sm font-semibold text-white">Open job</Link>}
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {q.status === "APPROVED" && (
            <Card title="Approved: book it" className="border-emerald-200">
              <p className="mb-3 text-sm">Approved by <b>{q.approvedByName}</b> {prettyDateTime(q.approvedAt)}. Total {money(q.totalCents)}.</p>
              <form action={quoteConvert} className="grid items-end gap-3 sm:grid-cols-3">
                {hidden}
                <Field label="First visit" hint="Blank = schedule later"><Input type="date" name="date" /></Field>
                <Field label="Billing"><select name="billingType" className={inputCls} defaultValue="FIXED_PRICE"><option value="FIXED_PRICE">Fixed price (the quote)</option><option value="PER_VISIT">Per visit</option></select></Field>
                <Button>Convert to job</Button>
              </form>
            </Card>
          )}
          {editable ? (
            <Card title="Edit quote">
              <form action={quoteUpdate} className="space-y-4">
                {hidden}
                <Field label="Title"><Input name="title" defaultValue={q.title ?? ""} required /></Field>
                <QuoteLinesEditor lines={q.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity) }))} suggestions={services.map((s) => s.name)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Discount ($)"><Input name="discount" type="number" step="0.01" min="0" defaultValue={q.discountCents / 100 || ""} /></Field>
                  <Field label="Good until"><Input name="validUntil" type="date" defaultValue={dateOnly(q.validUntil) ?? ""} /></Field>
                </div>
                <Field label="Message to the client"><Textarea name="message" rows={3} defaultValue={q.message ?? ""} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button name="send" value="1">Save &amp; send to {q.client.firstName}</Button>
                  <Button variant="secondary">Save draft</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card title={q.title ?? "Quote"}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {q.lineItems.map((l) => (
                    <tr key={l.id} className={l.isOptional && !l.isSelected ? "text-ink-soft line-through" : ""}>
                      <td className="py-2">{l.name}{l.isOptional && <span className="ml-1 text-xs">(optional{l.isSelected ? ", chosen" : ""})</span>}{l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}</td>
                      <td className="py-2 text-right text-ink-soft">{Number(l.quantity) !== 1 && `${Number(l.quantity)} × ${money(l.unitPriceCents)}`}</td>
                      <td className="py-2 text-right font-semibold">{money(l.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-navy">
                  {q.discountCents > 0 && <tr><td colSpan={2} className="pt-2 text-ink-soft">Discount</td><td className="pt-2 text-right">−{money(q.discountCents)}</td></tr>}
                  <tr><td colSpan={2} className="pt-2 font-semibold">Total</td><td className="pt-2 text-right font-display text-xl font-bold">{money(q.totalCents)}</td></tr>
                </tfoot>
              </table>
              {q.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-tint p-3 text-sm">{q.message}</p>}
            </Card>
          )}
          {photos.length > 0 && <Card title="Photos"><Gallery photos={photos} back={here} /></Card>}
          <Card title="Details">
            <Dl rows={[["Sent", q.sentAt ? prettyDateTime(q.sentAt) : "Not yet"], ["Good until", prettyDate(dateOnly(q.validUntil))], ["Approved", q.approvedAt ? `${prettyDateTime(q.approvedAt)} by ${q.approvedByName}` : null]]} />
            {q.status !== "CONVERTED" && q.status !== "ARCHIVED" && <form action={quoteArchive} className="mt-3">{hidden}<Button variant="secondary">Archive</Button></form>}
          </Card>
        </div>
        <Timeline notes={[]} events={events} target={{ clientId: q.clientId }} path={here} />
      </div>
    </>
  );
}
