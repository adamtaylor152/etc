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
import { Badge, Button, Card, Dl, Field, Input, Notice, Textarea, btn, inputCls } from "@/components/ui";
import { DetailHeader } from "@/components/detail-header";
import { Menu, type MenuItem } from "@/components/menu";
import { Archive, Copy, Download, Eye } from "lucide-react";
import { dateOnly, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { business, businessId, db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { smsEnabled, toE164 } from "@/server/sms";
import { optionTotals, quoteEditable, quoteExpired, quoteOptions, valuedOption } from "@/server/status/quote";
import { quoteArchive, quoteConvert, quoteDecline, quoteMarkApproved, quoteReopen, quoteSaveTemplate, quoteSend, quoteUpdate, quoteViewAsClient } from "../../quote-actions";
import { prettyPhone } from "@/components/phone";

export async function generateMetadata({ params }: PageProps<"/quotes/[id]">) {
  await requireOwner();
  const q = await db.quote.findFirst({ where: { id: (await params).id, businessId: await businessId() }, select: { number: true } });
  return { title: q ? `Quote #${q.number}` : "Quote" };
}

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
  const more = "text-sm font-semibold text-blue hover:text-blue-deep";
  const link = "font-semibold text-blue hover:text-blue-deep";
  const first = q.client.firstName;
  const dep = q.depositType !== "NONE" ? depositCents(q.totalCents, q.depositType, q.depositValue) : 0;
  const sentLine = q.sentAt ? `Sent ${prettyDateTime(q.lastSentAt ?? q.sentAt)} by ${q.lastSentVia === "SMS" ? "text" : "email"}` : null;
  // Which single action is the primary one right now: the form's "save and send" while editable, otherwise the next step.
  const menu: MenuItem[] = [
    { label: "Create similar quote", href: `/quotes/new?client=${q.clientId}&similar=${q.id}`, icon: <Copy className="size-4 text-ink-soft" aria-hidden /> },
    { label: "Similar quote for another client", href: `/quotes/new?similar=${q.id}`, icon: <Copy className="size-4 text-ink-soft" aria-hidden /> },
    ...(q.status !== "DRAFT" ? [{ label: "View as the client", action: quoteViewAsClient, fields: { id: q.id, back: here }, icon: <Eye className="size-4 text-ink-soft" aria-hidden /> }] : []),
    ...(q.status !== "CONVERTED" && q.status !== "ARCHIVED" ? [{ divider: true as const }, { label: "Archive quote", action: quoteArchive, fields: { id: q.id, back: here }, icon: <Archive className="size-4" aria-hidden />, danger: true, confirm: "Archive this quote? It leaves the pipeline and the quotes list." }] : []),
  ];
  // The totals as last saved, right-aligned under the lines (read view and editor alike).
  const totals = (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm tabular-nums">
      {q.discountCents > 0 && <div className="flex justify-between gap-4"><dt className="text-ink-soft">Discount{q.discountType === "PERCENT" && ` (${q.discountValue / 100}%)`}</dt><dd>−{cad(q.discountCents)}</dd></div>}
      {q.taxCents > 0 && <div className="flex justify-between gap-4"><dt className="text-ink-soft">{biz.taxName}{biz.pricesIncludeTax ? " (included)" : ""}</dt><dd>{cad(q.taxCents)}</dd></div>}
      <div className="flex items-baseline justify-between gap-4 border-t border-navy pt-2"><dt className="font-semibold">Total{editable && <span className="font-normal text-ink-soft"> as last saved</span>}</dt><dd className="font-display text-xl font-semibold">{cad(q.totalCents)}</dd></div>
      {dep > 0 && <div className="flex justify-between gap-4 text-ink-soft"><dt>Deposit{q.depositRequired && " (required)"}</dt><dd>{cad(dep)}</dd></div>}
      {valued && !chosen && <p className="text-right text-xs text-ink-soft">Valued at &quot;{valued.name}&quot; until the client chooses an option.</p>}
    </dl>
  );
  return (
    <>
      <DetailHeader
        back={{ href: "/quotes", label: "Quotes" }}
        kind={<span className="tabular-nums">Quote #{q.number}</span>}
        status={expired ? <Badge tone="red">Expired</Badge> : <Badge tone={QUOTE[q.status][1]}>{QUOTE[q.status][0]}</Badge>}
        title={q.title ?? "Quote"}
        sub={<><Link className={link} href={`/clients/${q.clientId}`}>{clientName(q.client)}</Link>{q.property && ` · ${q.property.formatted}`}{q.request && <> · <Link className={link} href={`/requests/${q.request.id}`}>request #{q.request.number}</Link></>} · <span className="font-semibold text-navy tabular-nums">{cad(q.totalCents)}</span></>}
        actions={<>
          {!editable && (q.status === "AWAITING_RESPONSE") && <form action={quoteSend}>{hidden}<Button variant="secondary">Resend</Button></form>}
          {q.status === "AWAITING_RESPONSE" && textable && <form action={quoteSend}>{hidden}<input type="hidden" name="via" value="SMS" /><Button variant="secondary">Send by text</Button></form>}
          {awaiting && (
            <form action={quoteMarkApproved} className="flex gap-2">{hidden}
              {options.length > 0 && <select name="option" required defaultValue="" aria-label="Option the client chose" className={`${inputCls} max-w-44`}><option value="" disabled>Client chose…</option>{options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select>}
              <Button variant={editable ? "secondary" : "primary"} className="shrink-0 whitespace-nowrap">Mark approved</Button>
            </form>
          )}
          {q.status === "DECLINED" && <form action={quoteReopen}>{hidden}<Button>Reopen as draft</Button></form>}
          {q.jobId && <Link href={`/jobs/${q.jobId}`} className={btn("primary")}>Open job</Link>}
          <a href={`/api/export/pdf/quote/${q.id}`} target="_blank" rel="noreferrer" className={btn("secondary")}><Download className="-ml-0.5 size-4" aria-hidden />PDF</a>
          <Menu label="More" items={menu} />
        </>}
      />
      <Flash error={sp.error} />
      {sp.sent && <Notice tone="good">{sp.sent === "text" ? `Quote texted to ${prettyPhone(q.client.phone)}.` : `Quote emailed to ${q.client.email}.`}</Notice>}
      {sp.template && <Notice tone="good">Template saved. Pick it when you start a new quote; rename or delete it in <Link href="/settings" className="underline underline-offset-2">Settings</Link>.</Notice>}
      {q.status === "DRAFT" && <Notice>Draft. Finish the lines below, then save and send it to {first}.</Notice>}
      {q.status === "AWAITING_RESPONSE" && !expired && <Notice>Waiting for {first} to answer.{sentLine && ` ${sentLine}.`}{q.validUntil && ` Good until ${prettyDate(dateOnly(q.validUntil))}.`}</Notice>}
      {expired && <Notice tone="warn">This quote expired on {prettyDate(dateOnly(q.validUntil))} without an answer. Resend it, mark it approved if {first} said yes another way, or mark it declined under Details.</Notice>}
      {q.status === "DECLINED" && (
        <div role="status" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900"><p className="font-semibold">Declined {prettyDateTime(q.declinedAt)}</p>{q.declineReason && <p className="mt-1 whitespace-pre-line">{q.declineReason}</p>}<p className="mt-1 text-red-900/80">Reopen it as a draft to rework and send again, or create a similar quote.</p></div>
      )}
      {q.status === "CHANGES_REQUESTED" && q.changeRequestMessage && (
        <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950"><p className="font-semibold">{first} asked for changes:</p><p className="mt-1 max-w-[70ch] whitespace-pre-line">{q.changeRequestMessage}</p></div>
      )}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {q.status === "APPROVED" && (
            <Card title="Approved: book it" className="border-emerald-200">
              <p className="mb-3 max-w-[70ch] text-sm">Approved by <span className="font-semibold">{q.approvedByName}</span> · <span className="tabular-nums">{prettyDateTime(q.approvedAt)}</span>{chosen && <> · chose <span className="font-semibold">{chosen.name}</span></>} · total <span className="font-semibold tabular-nums">{cad(q.totalCents)}</span></p>
              <form action={quoteConvert} className="grid items-end gap-3 sm:grid-cols-3">
                {hidden}
                <Field label="First visit" hint="Blank = schedule later"><Input type="date" name="date" /></Field>
                <Field label="Billing" hint="How the job is invoiced"><select name="billingType" className={inputCls} defaultValue="FIXED_PRICE"><option value="FIXED_PRICE">Fixed price (the quote)</option><option value="PER_VISIT">Per visit</option></select></Field>
                <div className="sm:pb-5"><Button className="w-full">Convert to job</Button></div>
                {q.depositRequired && deposit && deposit.status !== "PAID" && deposit.status !== "VOID" && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:col-span-3"><input type="checkbox" name="skipDeposit" className="mt-0.5 size-4 shrink-0" /> The required deposit isn&apos;t paid yet. Book without the deposit.</label>
                )}
              </form>
            </Card>
          )}
          {editable ? (
            <Card title="Edit quote">
              <form action={quoteUpdate} className="space-y-5">
                {hidden}
                <Field label="Title"><Input name="title" defaultValue={q.title ?? ""} required /></Field>
                <QuoteLinesEditor quoteId={q.id} options={options} lines={q.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity), photoId: l.photoId && shown.has(l.photoId) ? l.photoId : null }))} services={services.map((s) => ({ name: s.name, description: s.description, unitPriceCents: s.unitPriceCents }))} />
                <section aria-labelledby="terms-h" className="border-t border-line-soft pt-5">
                  <h3 id="terms-h" className="mb-3 text-sm font-semibold">Discount, deposit and expiry</h3>
                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Field label="Discount">
                        <span className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
                          <select name="discountType" defaultValue={q.discountType} aria-label="Discount type" className={inputCls}><option value="FIXED">$ off</option><option value="PERCENT">% off</option></select>
                          <Input name="discount" type="number" step="0.01" min="0" aria-label="Discount amount" defaultValue={(q.discountType === "PERCENT" ? q.discountValue : q.discountCents) / 100 || ""} className="tabular-nums" />
                        </span>
                      </Field>
                      <Field label="Deposit">
                        <span className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
                          <select name="depositType" defaultValue={q.depositType} aria-label="Deposit type" className={inputCls}><option value="NONE">None</option><option value="PERCENT">% of total</option><option value="FIXED">$ amount</option></select>
                          <Input name="depositValue" type="number" step="0.01" min="0" aria-label="Deposit amount" defaultValue={q.depositType === "FIXED" ? q.depositValue / 100 : q.depositValue || ""} className="tabular-nums" />
                        </span>
                      </Field>
                      <label className="flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" name="depositRequired" defaultChecked={q.depositRequired} className="size-4 shrink-0" />Deposit required to book</label>
                    </div>
                    <div className="space-y-4">
                      <Field label="Good until"><Input name="validUntil" type="date" defaultValue={dateOnly(q.validUntil) ?? ""} /></Field>
                      <div className="rounded-lg bg-tint p-3">{totals}</div>
                    </div>
                  </div>
                </section>
                <Field label="Message to the client"><Textarea name="message" rows={3} defaultValue={q.message ?? ""} /></Field>
                <div className="sticky bottom-[4.5rem] z-10 -mx-1 flex flex-wrap justify-end gap-2 rounded-xl border border-line bg-white/95 p-2.5 shadow-lift backdrop-blur sm:bottom-3">
                  <Button variant="secondary" className="max-sm:px-3">Save draft</Button>
                  {textable && <Button variant="secondary" name="send" value="sms" className="max-sm:flex-1 max-sm:px-3"><span>Save and text<span className="max-sm:hidden"> to {first}</span></span></Button>}
                  <Button name="send" value="1" className="max-sm:flex-1 max-sm:px-3"><span>Save and send<span className="max-sm:hidden"> to {first}</span></span></Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card title="What we quoted">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-medium text-ink-soft"><th className="py-2 pr-3 font-medium">Item</th><th className="hidden px-3 text-right font-medium sm:table-cell">Qty × price</th><th className="pl-3 text-right font-medium">Amount</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {groups.flatMap(({ option: o, lines }) => [
                    o && (
                      <tr key={o.key} className={`bg-tint/60 ${chosen && chosen !== o ? "text-ink-soft" : ""}`}>
                        <td colSpan={2} className="px-2 py-2 font-semibold max-sm:hidden"><span className="flex flex-wrap items-center gap-2">{o.name}{o.recommended && <Badge tone="blue">Recommended</Badge>}{chosen === o && <Badge tone="green">Client chose this</Badge>}</span></td>
                        <td className="px-2 py-2 font-semibold sm:hidden"><span className="flex flex-wrap items-center gap-2">{o.name}{o.recommended && <Badge tone="blue">Recommended</Badge>}{chosen === o && <Badge tone="green">Client chose this</Badge>}</span></td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{cad(optionTotals(q.lineItems, q, biz, o.key).totalCents)}</td>
                      </tr>
                    ),
                    ...lines.map((l) => {
                      const out = (l.isOptional && !l.isSelected) || (chosen && l.optionKey && l.optionKey !== chosen.key);
                      return (
                        <tr key={l.id} className={out ? "text-ink-soft" : ""}>
                          <td className={`py-2.5 pr-3 ${o ? "pl-2" : ""}`}>
                            {l.photoId && shown.has(l.photoId) && <a href={`/api/media/${l.photoId}/lg`} target="_blank" rel="noreferrer" className="float-right ml-2"><img src={`/api/media/${l.photoId}/sm`} alt={`Photo: ${l.name}`} loading="lazy" className="size-12 rounded-lg border border-line object-cover" /></a>}
                            <span className={out ? "line-through" : "font-medium"}>{l.name}</span>
                            {l.isOptional && <span className="ml-1.5 text-xs text-ink-soft">Optional{l.isSelected ? ", chosen" : ", not chosen"}</span>}
                            {l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}
                            {Number(l.quantity) !== 1 && <span className="block text-xs text-ink-soft tabular-nums sm:hidden">{Number(l.quantity)} × {cad(l.unitPriceCents)}</span>}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2.5 text-right align-top text-ink-soft sm:table-cell">{Number(l.quantity) !== 1 && `${Number(l.quantity)} × ${cad(l.unitPriceCents)}`}</td>
                          <td className={`whitespace-nowrap py-2.5 pl-3 text-right align-top ${out ? "line-through" : "font-semibold"}`}>{cad(l.totalCents)}</td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
              <div className="mt-4">{totals}</div>
              {q.message && <div className="mt-5 border-t border-line-soft pt-4"><h3 className="mb-1 text-xs font-medium text-ink-soft">Message to the client</h3><p className="max-w-[70ch] whitespace-pre-line text-sm">{q.message}</p></div>}
            </Card>
          )}
          {photos.some((p) => !linePhotos.has(p.id)) && <Card title="Photos"><Gallery photos={photos.filter((p) => !linePhotos.has(p.id))} back={here} /></Card>}
        </div>
        <div className="min-w-0 space-y-5">
          <Card title="Details">
            {deposit && <p className="mb-2 rounded-lg bg-tint px-3 py-2.5 text-sm">Deposit <span className="tabular-nums">{cad(depositCents(q.totalCents, q.depositType, q.depositValue))}</span>{q.depositRequired && " (required)"}: {deposit.status === "PAID" ? <span className="font-semibold text-emerald-700">paid</span> : <><Link href={`/invoices/${deposit.id}`} className={link}>invoice #{deposit.number}</Link> · <Link href={`/clients/${q.clientId}/collect?invoice=${deposit.id}`} className={link}>record deposit</Link></>}{deposit.appliedToInvoiceId && " · applied to the job invoice"}</p>}
            {!deposit && q.depositType !== "NONE" && <p className="mb-2 text-sm text-ink-soft">Deposit <span className="tabular-nums">{cad(depositCents(q.totalCents, q.depositType, q.depositValue))}</span>{q.depositRequired && " (required)"}: invoiced when the client approves.</p>}
            <Dl rows={[["Sent", q.sentAt ? `${prettyDateTime(q.lastSentAt ?? q.sentAt)} by ${q.lastSentVia === "SMS" ? "text" : "email"}` : "Not yet"], ["Good until", prettyDate(dateOnly(q.validUntil))], ["Approved", q.approvedAt ? `${prettyDateTime(q.approvedAt)} by ${q.approvedByName}` : null], ["Option chosen", chosen?.name ?? null]]} />
            {awaiting && !textable && <p className="mt-2 text-xs text-ink-soft">Send by text is offered when texting is set up and the client has a mobile number, said yes to text updates and hasn&apos;t texted STOP.</p>}
            <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
              {awaiting && (
                <details>
                  <summary className={more}>Mark declined or lost</summary>
                  <form action={quoteDecline} className="mt-2 space-y-2">{hidden}<Input name="reason" maxLength={500} placeholder="Reason (optional)" aria-label="Reason it was declined (optional)" /><Button variant="danger">Mark declined</Button></form>
                </details>
              )}
              <details>
                <summary className={more}>Save as template</summary>
                <form action={quoteSaveTemplate} className="mt-2 space-y-2">{hidden}<Input name="name" required maxLength={80} defaultValue={q.title ?? ""} placeholder="Template name" aria-label="Template name" /><Button variant="secondary">Save template</Button></form>
                <p className="mt-2 text-xs text-ink-soft">Keeps the title, message, lines, options, discount and deposit as last saved (not line photos). An existing template with the same name is replaced.</p>
              </details>
            </div>
          </Card>
          <SignatureCard where={{ quoteId: q.id }} signHref={`/sign/quote/${q.id}`} />
          <RecordPanel businessId={bid} target={{ quoteId: q.id }} clientId={q.clientId} path={here} />
        </div>
      </div>
    </>
  );
}
