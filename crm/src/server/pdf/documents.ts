// What goes on each PDF (invoice, quote, statement): loaded from the database, laid out by render.ts.
import type { Business } from "@/generated/prisma/client";
import { TERMS_LABEL } from "../billing/invoice";
import { dateOnly, todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { env } from "../env";
import { money } from "../money";
import { clientName } from "../queries";
import { loadStatement, type StatementRange } from "../statement";
import { stripeEnabled } from "../stripe";
import { renderPdf, type PdfDoc } from "./render";

export type PdfFile = { filename: string; bytes: Uint8Array };
type Biz = Pick<Business, "name" | "legalName" | "mailingAddress" | "phone" | "helpEmail" | "website" | "etransferEmail" | "taxRegistered" | "taxName" | "taxRateBps" | "taxNumber" | "pricesIncludeTax">;

/** "Dec 4, 2026": documents people file need the year. */
const day = (s: string | null) => (s ? toDbDate(s).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const qty = (q: unknown) => String(Number(q));
const site = (b: Biz) => (b.website ?? env.siteUrl).replace(/^https?:\/\//, "");
const pct = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");

/** Pure pieces, unit-tested. */
export const businessLines = (b: Biz) => [
  b.name, ...(b.legalName && b.legalName !== b.name ? [b.legalName] : []), ...(b.mailingAddress ? b.mailingAddress.split(/\r?\n/) : []),
  [b.phone ?? env.phone, b.helpEmail ?? env.helpEmail, site(b)].filter(Boolean).join("  ·  "),
  ...(b.taxRegistered && b.taxNumber ? [`${b.taxName} # ${b.taxNumber}`] : []),
];
/** Subtotal / discount / GST / total rows, following the business's tax settings (see invoiceTotals). */
export function totalRows(b: Biz, t: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }, paidCents?: number) {
  const rows: PdfDoc["totals"] = [];
  const gst = `${b.taxName} (${pct(b.taxRateBps)}%)`;
  if (t.discountCents > 0 || (b.taxRegistered && !b.pricesIncludeTax)) rows.push({ label: "Subtotal", value: money(t.subtotalCents) });
  if (t.discountCents > 0) rows.push({ label: "Discount", value: `-${money(t.discountCents)}` });
  if (b.taxRegistered && !b.pricesIncludeTax) rows.push({ label: gst, value: money(t.taxCents) });
  rows.push({ label: "Total", value: money(t.totalCents), bold: true });
  if (b.taxRegistered && b.pricesIncludeTax) rows.push({ label: `Includes ${gst}`, value: money(t.taxCents) });
  if (paidCents !== undefined) {
    rows.push({ label: "Paid", value: paidCents ? `-${money(paidCents)}` : money(0) });
    rows.push({ label: "Balance due", value: money(Math.max(0, t.totalCents - paidCents)), bold: true });
  }
  return rows;
}
const taxNote = (b: Biz) => (b.taxRegistered ? "" : "Prices include tax. No GST is charged.");

const INVOICE_BADGE: Record<string, string> = { DRAFT: "DRAFT", PAID: "PAID", VOID: "VOID", BAD_DEBT: "" };

export async function invoicePdf(invoiceId: string, businessId: string): Promise<PdfFile | null> {
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, businessId }, include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!inv) return null;
  const [biz, property] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    inv.propertyId ? db.property.findUnique({ where: { id: inv.propertyId } }) : null,
  ]);
  const balance = Math.max(0, inv.totalCents - inv.amountPaidCents);
  const etransfer = biz.etransferEmail || env.etransferEmail;
  const owing = balance > 0 && inv.status !== "VOID" && inv.status !== "PAID";
  const bytes = await renderPdf({
    title: inv.kind === "DEPOSIT" ? "Deposit invoice" : "Invoice", number: `#${inv.number}`, badge: INVOICE_BADGE[inv.status] ?? (inv.amountPaidCents > 0 ? "PARTLY PAID" : ""),
    business: businessLines(biz),
    to: [clientName(inv.client), ...(inv.client.companyName ? [`${inv.client.firstName} ${inv.client.lastName}`.trim()] : []), ...(property ? [property.formatted] : []), inv.client.email],
    meta: [["Issued", day(dateOnly(inv.issuedOn)) || "Not sent yet"], ["Due", day(dateOnly(inv.dueOn)) || TERMS_LABEL[inv.paymentTerms]], ["Terms", TERMS_LABEL[inv.paymentTerms]], ["e-Transfer code", inv.etransferRef]],
    subject: inv.subject ?? undefined,
    table: {
      columns: [{ label: "Description" }, { label: "Service date", width: 84 }, { label: "Qty", width: 44, align: "right" }, { label: "Unit price", width: 72, align: "right" }, { label: "Amount", width: 76, align: "right" }],
      rows: inv.lineItems.map((l) => ({ cells: [l.name, day(dateOnly(l.serviceDate)), qty(l.quantity), money(l.unitPriceCents), money(l.totalCents)], sub: l.description ?? undefined })),
    },
    totals: totalRows(biz, inv, inv.amountPaidCents),
    notes: [
      { heading: "How to pay", body: owing ? [etransfer ? `Interac e-Transfer: send ${money(balance)} to ${etransfer} and put ${inv.etransferRef} in the message so we can match it.` : "", stripeEnabled() ? "Card: use the pay link in your invoice email." : "", "Cash to the crew works too."].filter(Boolean).join("\n") : "" },
      { heading: "Message", body: inv.message ?? "" },
      { heading: "Tax", body: taxNote(biz) },
    ],
    footer: `${biz.legalName ?? biz.name}  ·  ${site(biz)}  ·  ${biz.helpEmail ?? env.helpEmail}`,
  });
  return { filename: `etc-invoice-${inv.number}.pdf`, bytes };
}

export async function quotePdf(quoteId: string, businessId: string): Promise<PdfFile | null> {
  const q = await db.quote.findFirst({ where: { id: quoteId, businessId }, include: { client: true, property: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!q) return null;
  const biz = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const deposit = q.depositType === "PERCENT" ? `${q.depositValue}% of the total` : q.depositType === "FIXED" ? money(q.depositValue) : "";
  const bytes = await renderPdf({
    title: "Quote", number: `#${q.number}`, badge: q.status === "DRAFT" ? "DRAFT" : q.status === "APPROVED" || q.status === "CONVERTED" ? "APPROVED" : "",
    business: businessLines(biz),
    to: [clientName(q.client), ...(q.client.companyName ? [`${q.client.firstName} ${q.client.lastName}`.trim()] : []), ...(q.property ? [q.property.formatted] : []), q.client.email],
    meta: [["Date", day(todayLocal(q.sentAt ?? q.createdAt))], ...(q.validUntil ? [["Good until", day(dateOnly(q.validUntil))] as [string, string]] : [])],
    subject: q.title ?? undefined,
    table: {
      columns: [{ label: "Description" }, { label: "Qty", width: 44, align: "right" }, { label: "Unit price", width: 72, align: "right" }, { label: "Amount", width: 76, align: "right" }],
      rows: q.lineItems.map((l) => ({
        cells: [l.name, qty(l.quantity), money(l.unitPriceCents), money(l.totalCents)],
        sub: [l.isOptional ? (l.isSelected ? "Optional (included in the total)" : "Optional (not in the total)") : "", l.description ?? ""].filter(Boolean).join("\n") || undefined,
      })),
    },
    totals: totalRows(biz, q),
    notes: [
      { heading: "Message", body: q.message ?? "" },
      { heading: "Deposit", body: deposit ? `${deposit}${q.depositRequired ? ", needed to book your date" : ""}.` : "" },
      { heading: "Tax", body: taxNote(biz) },
    ],
    footer: `${biz.legalName ?? biz.name}  ·  ${site(biz)}  ·  ${biz.helpEmail ?? env.helpEmail}`,
  });
  return { filename: `etc-quote-${q.number}.pdf`, bytes };
}

export async function statementPdf(clientId: string, businessId: string, range: StatementRange): Promise<PdfFile | null> {
  const s = await loadStatement(businessId, clientId, range);
  if (!s) return null;
  const { client, biz, since, st } = s;
  const today = todayLocal();
  const etransfer = biz.etransferEmail || env.etransferEmail;
  const bytes = await renderPdf({
    title: "Statement", number: day(today),
    business: businessLines(biz),
    to: [clientName(client), ...(client.properties[0] ? [client.properties[0].formatted] : []), client.email],
    meta: [["Period", since ? `From ${day(dateOnly(since))}` : "All history"], ["Balance owing", money(st.balanceCents)]],
    table: {
      columns: [{ label: "Date", width: 84 }, { label: "Description" }, { label: "Charges", width: 76, align: "right" }, { label: "Payments", width: 76, align: "right" }, { label: "Balance", width: 76, align: "right" }],
      rows: [
        ...(since ? [{ cells: [day(dateOnly(since)), "Opening balance", "", "", money(st.openingCents)] }] : []),
        ...st.rows.map((r) => ({ cells: [day(dateOnly(r.date)), r.label, r.amountCents > 0 ? money(r.amountCents) : "", r.amountCents < 0 ? money(-r.amountCents) : "", money(r.balanceCents)] })),
      ],
    },
    totals: [{ label: "Balance owing", value: money(st.balanceCents), bold: true }],
    notes: [{ heading: "How to pay", body: st.balanceCents > 0 ? [etransfer ? `Interac e-Transfer to ${etransfer} (put your invoice's ETC- code in the message).` : "", "Cash to the crew works too."].filter(Boolean).join("\n") : "" }],
    footer: `${biz.legalName ?? biz.name}  ·  ${site(biz)}  ·  ${biz.helpEmail ?? env.helpEmail}`,
  });
  return { filename: `etc-statement-${today}.pdf`, bytes };
}

export const pdfResponse = (f: PdfFile | null) => f
  ? new Response(Buffer.from(f.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${f.filename}"`, "Cache-Control": "private, no-store" } })
  : new Response("Not found", { status: 404 });
