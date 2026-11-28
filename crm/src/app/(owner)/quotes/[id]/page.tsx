/* eslint-disable @next/next/no-img-element -- private line photos, our own variants */
import { requireOwner } from "@/server/auth";
import { depositCents } from "@/server/billing/invoice";
import { SignatureCard } from "@/components/signatures";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { QUOTE } from "@/components/status";
import { Gallery } from "@/components/gallery";
import { QuoteLinesEditor } from "@/components/quote-lines";
import { RecordPanel } from "@/components/record-panel";
import { Badge, Button, ButtonLink, Card, Dl, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";
import { smsEnabled, toE164 } from "@/server/sms";
import { optionTotals, quoteEditable, quoteExpired, quoteOptions, valuedOption } from "@/server/status/quote";
import { quoteArchive, quoteConvert, quoteDecline, quoteMarkApproved, quoteReopen, quoteSaveTemplate, quoteSend, quoteUpdate, quoteViewAsClient } from "../../quote-actions";

export default async function QuotePage({ params, searchParams }: PageProps<"/quotes/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const biz = await business();
  const q = await db.quote.findFirst({ where: { id, businessId: bid }, include: { client: true, property: true, request: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!q) notFound();
  const [services, photos] = await Promise.all([
    db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } }),
    db.attachment.findMany({ where: { businessId: bid, deletedAt: null, OR: [{ quoteId: id }, ...(q.requestId ? [{ requestId: q.requestId }] : [])] }, orderBy: { createdAt: "asc" } }),
  ]);
  const editable = quoteEditable(q.status);
  // Option sets: the common lines first, then each option with its own lines and what the client would pay for it.
  const options = quoteOptions(q.options);
  const chosen = options.find((o) => o.key === q.chosenOption);
  const valued = options.find((o) => o.key === valuedOption(options, q.lineItems, q, q.chosenOption));
  const groups = [{ option: null, lines: q.lineItems.filter((l) => !l.optionKey) }, ...options.map((o) => ({ option: o, lines: q.lineItems.filter((l) => l.optionKey === o.key) }))];
  const linePhotos = new Set(q.lineItems.flatMap((l) => l.photoId ?? []));
  const shown = new Set(photos.map((p) => p.id)); // not deleted
  const deposit = await db.invoice.findFirst({ where: { kind: "DEPOSIT", quoteId: q.id } });
  const here = `/quotes/${id}`;
  const hidden = <><input type="hidden" name="id" value={q.id} /><input type="hidden" name="back" value={here} /></>;
  const expired = quoteExpired({ status: q.status, validUntil: dateOnly(q.validUntil) }, todayLocal());
  // Same rule the outbox applies to every automatic text: a mobile number, said yes to texts, hasn't texted STOP.
  const textable = smsEnabled() && !!toE164(q.client.phone) && q.client.smsOptIn && !q.client.smsOptOutAt;
  const awaiting = q.status === "AWAITING_RESPONSE" || q.status === "CHANGES_REQUESTED";
  const more = "cursor-pointer text-sm font-semibold text-blue";
  return (
    <>
      <Flash error={sp.error} />
      {sp.sent && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{sp.sent === "text" ? `Quote texted to ${q.client.phone}.` : `Quote emailed to ${q.client.email}.`}</p>}
      {sp.template && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Template saved. Pick it when you start a new quote; rename or delete it in <Link href="/settings" className="underline">Settings</Link>.</p>}
      {q.status === "DECLINED" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm"><b>Declined {prettyDateTime(q.declinedAt)}</b>{q.declineReason && <p className="mt-1 whitespace-pre-line">{q.declineReason}</p>}<p className="mt-1 text-ink-soft">Reopen it as a draft to rework and send again, or create a similar quote.</p></div>
      )}
      {q.status === "CHANGES_REQUESTED" && q.changeRequestMessage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><b>{q.client.firstName} asked for changes:</b><p className="mt-1 whitespace-pre-line">{q.changeRequestMessage}</p></div>
      )}
      <PageHeader
        title={<>Quote #{q.number} {expired ? <Badge tone="red">Expired</Badge> : <Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge>}</>}
        sub={<><Link className="font-semibold text-blue" href={`/clients/${q.clientId}`}>{clientName(q.client)}</Link>{q.property && ` · ${q.property.formatted}`}{q.request && <> · <Link className="text-blue" href={`/requests/${q.request.id}`}>request #{q.request.number}</Link></>}</>}
        actions={<>
          {!editable && (q.status === "AWAITING_RESPONSE") && <form action={quoteSend}>{hidden}<Button variant="secondary">Resend</Button></form>}
          {q.status === "AWAITING_RESPONSE" && textable && <form action={quoteSend}>{hidden}<input type="hidden" name="via" value="SMS" /><Button variant="secondary">Send by text</Button></form>}
          {awaiting && (
            <form action={quoteMarkApproved} className="flex gap-2">{hidden}
              {options.length > 0 && <select name="option" required defaultValue="" aria-label="Option the client chose" className="min-h-11 rounded-full border-2 border-line bg-white px-3 text-sm"><option value="" disabled>Client chose…</option>{options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select>}
              <Button variant="secondary">Mark approved</Button>
            </form>
          )}
          {q.status === "DECLINED" && <form action={quoteReopen}>{hidden}<Button variant="secondary">Reopen as draft</Button></form>}
          <ButtonLink href={`/quotes/new?client=${q.clientId}&similar=${q.id}`}>Create similar quote</ButtonLink>
          {q.status !== "DRAFT" && <form action={quoteViewAsClient}>{hidden}<Button variant="secondary">Client view</Button></form>}
          {q.jobId && <Link href={`/jobs/${q.jobId}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-blue bg-blue px-5 text-sm font-semibold text-white">Open job</Link>}
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {q.status === "APPROVED" && (
            <Card title="Approved: book it" className="border-emerald-200">
              <p className="mb-3 text-sm">Approved by <b>{q.approvedByName}</b> {prettyDateTime(q.approvedAt)}.{chosen && <> Chose <b>{chosen.name}</b>.</>} Total {money(q.totalCents)}.</p>
              <form action={quoteConvert} className="grid items-end gap-3 sm:grid-cols-3">
                {hidden}
                <Field label="First visit" hint="Blank = schedule later"><Input type="date" name="date" /></Field>
                <Field label="Billing"><select name="billingType" className={inputCls} defaultValue="FIXED_PRICE"><option value="FIXED_PRICE">Fixed price (the quote)</option><option value="PER_VISIT">Per visit</option></select></Field>
                <Button>Convert to job</Button>
                {q.depositRequired && deposit && deposit.status !== "PAID" && deposit.status !== "VOID" && (
                  <label className="flex items-center gap-2 text-sm text-amber-800 sm:col-span-3"><input type="checkbox" name="skipDeposit" className="size-4" /> The required deposit isn&apos;t paid yet. Book without the deposit.</label>
                )}
              </form>
            </Card>
          )}
          {editable ? (
            <Card title="Edit quote">
              <form action={quoteUpdate} className="space-y-4">
                {hidden}
                <Field label="Title"><Input name="title" defaultValue={q.title ?? ""} required /></Field>
                <QuoteLinesEditor quoteId={q.id} options={options} lines={q.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity), photoId: l.photoId && shown.has(l.photoId) ? l.photoId : null }))} services={services.map((s) => ({ name: s.name, description: s.description, unitPriceCents: s.unitPriceCents }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Discount">
                    <span className="flex gap-2">
                      <select name="discountType" defaultValue={q.discountType} className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm"><option value="FIXED">$ off</option><option value="PERCENT">% off</option></select>
                      <Input name="discount" type="number" step="0.01" min="0" defaultValue={(q.discountType === "PERCENT" ? q.discountValue : q.discountCents) / 100 || ""} className="w-28" />
                    </span>
                  </Field>
                  <Field label="Good until"><Input name="validUntil" type="date" defaultValue={dateOnly(q.validUntil) ?? ""} /></Field>
                  <Field label="Deposit">
                    <span className="flex gap-2">
                      <select name="depositType" defaultValue={q.depositType} className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm"><option value="NONE">None</option><option value="PERCENT">% of total</option><option value="FIXED">$ amount</option></select>
                      <Input name="depositValue" type="number" step="0.01" min="0" defaultValue={q.depositType === "FIXED" ? q.depositValue / 100 : q.depositValue || ""} className="w-28" />
                    </span>
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="depositRequired" defaultChecked={q.depositRequired} className="size-4" />Deposit required to book</label>
                </div>
                <Field label="Message to the client"><Textarea name="message" rows={3} defaultValue={q.message ?? ""} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button name="send" value="1">Save &amp; send to {q.client.firstName}</Button>
                  {textable && <Button variant="secondary" name="send" value="sms">Save &amp; text to {q.client.firstName}</Button>}
                  <Button variant="secondary">Save draft</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card title={q.title ?? "Quote"}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {groups.flatMap(({ option: o, lines }) => [
                    o && (
                      <tr key={o.key} className={chosen && chosen !== o ? "text-ink-soft" : ""}>
                        <td colSpan={2} className="pt-4 pb-2 font-semibold">{o.name}{o.recommended && <span className="ml-2"><Badge tone="blue">Recommended</Badge></span>}{chosen === o && <span className="ml-2"><Badge tone="green">Client chose this</Badge></span>}</td>
                        <td className="pt-4 pb-2 text-right font-semibold">{money(optionTotals(q.lineItems, q, biz, o.key).totalCents)}</td>
                      </tr>
                    ),
                    ...lines.map((l) => (
                    <tr key={l.id} className={(l.isOptional && !l.isSelected) || (chosen && l.optionKey && l.optionKey !== chosen.key) ? "text-ink-soft line-through" : ""}>
                      <td className={`py-2 ${o ? "pl-3" : ""}`}>{l.photoId && shown.has(l.photoId) && <a href={`/api/media/${l.photoId}/lg`} target="_blank" rel="noreferrer" className="float-right ml-2"><img src={`/api/media/${l.photoId}/sm`} alt={`Photo: ${l.name}`} loading="lazy" className="size-12 rounded-lg object-cover" /></a>}{l.name}{l.isOptional && <span className="ml-1 text-xs">(optional{l.isSelected ? ", chosen" : ""})</span>}{l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}</td>
                      <td className="py-2 text-right text-ink-soft">{Number(l.quantity) !== 1 && `${Number(l.quantity)} × ${money(l.unitPriceCents)}`}</td>
                      <td className="py-2 text-right font-semibold">{money(l.totalCents)}</td>
                    </tr>
                    )),
                  ])}
                </tbody>
                <tfoot className="border-t-2 border-navy">
                  {q.discountCents > 0 && <tr><td colSpan={2} className="pt-2 text-ink-soft">Discount{q.discountType === "PERCENT" && ` (${q.discountValue / 100}%)`}</td><td className="pt-2 text-right">−{money(q.discountCents)}</td></tr>}
                  {q.taxCents > 0 && <tr><td colSpan={2} className="pt-2 text-ink-soft">{biz.taxName}{biz.pricesIncludeTax ? " (included)" : ""}</td><td className="pt-2 text-right">{money(q.taxCents)}</td></tr>}
                  <tr><td colSpan={2} className="pt-2 font-semibold">Total{valued && !chosen && <span className="block text-xs font-normal text-ink-soft">Valued at &quot;{valued.name}&quot; until the client chooses an option.</span>}</td><td className="pt-2 text-right font-display text-xl font-bold">{money(q.totalCents)}</td></tr>
                </tfoot>
              </table>
              {q.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-tint p-3 text-sm">{q.message}</p>}
            </Card>
          )}
          {photos.some((p) => !linePhotos.has(p.id)) && <Card title="Photos"><Gallery photos={photos.filter((p) => !linePhotos.has(p.id))} back={here} /></Card>}
          <Card title="Details">
            {deposit && <p className="mb-2 rounded-lg bg-tint p-3 text-sm">Deposit {money(depositCents(q.totalCents, q.depositType, q.depositValue))}{q.depositRequired && " (required)"}: {deposit.status === "PAID" ? <span className="font-semibold text-emerald-700">paid</span> : <><Link href={`/invoices/${deposit.id}`} className="font-semibold text-blue">invoice #{deposit.number}</Link> · <Link href={`/clients/${q.clientId}/collect?invoice=${deposit.id}`} className="font-semibold text-blue">record deposit</Link></>}{deposit.appliedToInvoiceId && " · applied to the job invoice"}</p>}
            {!deposit && q.depositType !== "NONE" && <p className="mb-2 text-sm text-ink-soft">Deposit {money(depositCents(q.totalCents, q.depositType, q.depositValue))}{q.depositRequired && " (required)"}: invoiced when the client approves.</p>}
            <Dl rows={[["Sent", q.sentAt ? `${prettyDateTime(q.lastSentAt ?? q.sentAt)} by ${q.lastSentVia === "SMS" ? "text" : "email"}` : "Not yet"], ["Good until", prettyDate(dateOnly(q.validUntil))], ["Approved", q.approvedAt ? `${prettyDateTime(q.approvedAt)} by ${q.approvedByName}` : null], ["Option chosen", chosen?.name ?? null]]} />
            {awaiting && !textable && <p className="mt-2 text-xs text-ink-soft">Send by text is offered when texting is set up and the client has a mobile number, said yes to text updates and hasn&apos;t texted STOP.</p>}
            {awaiting && (
              <details className="mt-3">
                <summary className={more}>Mark declined / lost</summary>
                <form action={quoteDecline} className="mt-2 flex flex-wrap gap-2">{hidden}<Input name="reason" maxLength={500} placeholder="Reason (optional)" className="max-w-sm" /><Button variant="secondary">Mark declined</Button></form>
              </details>
            )}
            <details className="mt-3">
              <summary className={more}>Save as template</summary>
              <form action={quoteSaveTemplate} className="mt-2 flex flex-wrap gap-2">{hidden}<Input name="name" required maxLength={80} defaultValue={q.title ?? ""} placeholder="Template name" className="max-w-sm" /><Button variant="secondary">Save template</Button></form>
              <p className="mt-1 text-xs text-ink-soft">Keeps the title, message, lines, options, discount and deposit as last saved (not line photos). An existing template with the same name is replaced.</p>
            </details>
            <p className="mt-3"><Link href={`/quotes/new?similar=${q.id}`} className={more}>Create a similar quote for another client</Link></p>
            {q.status !== "CONVERTED" && q.status !== "ARCHIVED" && <form action={quoteArchive} className="mt-3">{hidden}<Button variant="secondary">Archive</Button></form>}
          </Card>
        </div>
        <div className="space-y-5"><SignatureCard where={{ quoteId: q.id }} signHref={`/sign/quote/${q.id}`} /><RecordPanel businessId={bid} target={{ quoteId: q.id }} clientId={q.clientId} path={here} /></div>
      </div>
    </>
  );
}
