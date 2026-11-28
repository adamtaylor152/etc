import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MAX_TIP_CENTS, paymentStatusAfterRefund, refundableCents, refundIdempotencyKey, refundProblem, refundRoute, sessionTip, splitOverpayment, tipCents } from "@/server/billing/adjustments";
import { statusAfterPayments } from "@/server/billing/invoice";
import { businessLines, totalRows } from "@/server/pdf/documents";
import { cleaner, renderPdf, type PdfDoc } from "@/server/pdf/render";
import { parseStatementRange, statementQuery } from "@/server/statement";

describe("refunds", () => {
  it("what is left to refund", () => {
    expect(refundableCents({ amountCents: 5000, refundedCents: 0 })).toBe(5000);
    expect(refundableCents({ amountCents: 5000, refundedCents: 1500 })).toBe(3500);
    expect(refundableCents({ amountCents: 5000, refundedCents: 5000 })).toBe(0);
    expect(refundableCents({ amountCents: 5000, refundedCents: 9000 })).toBe(0);
  });
  it("refuses nothing, too much, and a payment already refunded", () => {
    const p = { amountCents: 5000, refundedCents: 1500 };
    expect(refundProblem(p, 3500)).toBeNull();
    expect(refundProblem(p, 1)).toBeNull();
    expect(refundProblem(p, 3501)).toBe("Only $35.00 of this payment is left to refund");
    expect(refundProblem(p, 0)).toBe("Enter an amount to refund");
    expect(refundProblem(p, -100)).toBe("Enter an amount to refund");
    expect(refundProblem(p, 10.5)).toBe("Enter an amount to refund");
    expect(refundProblem({ amountCents: 5000, refundedCents: 5000 }, 100)).toBe("This payment is already fully refunded");
  });
  it("payment status follows the refunded amount", () => {
    expect(paymentStatusAfterRefund({ amountCents: 5000, refundedCents: 0 })).toBe("SUCCEEDED");
    expect(paymentStatusAfterRefund({ amountCents: 5000, refundedCents: 100 })).toBe("PARTIALLY_REFUNDED");
    expect(paymentStatusAfterRefund({ amountCents: 5000, refundedCents: 5000 })).toBe("REFUNDED");
  });
  it("a refund re-opens a paid invoice (the existing status rule), a partial one too", () => {
    expect(statusAfterPayments("PAID", 5000, 5000 - 5000)).toBe("AWAITING_PAYMENT");
    expect(statusAfterPayments("PAID", 5000, 5000 - 1000)).toBe("AWAITING_PAYMENT");
    expect(statusAfterPayments("AWAITING_PAYMENT", 5000, 2000 - 500)).toBe("AWAITING_PAYMENT");
  });
  it("card payments go to Stripe by payment intent, or by checkout session; everything else is recorded only", () => {
    const card = { method: "CARD" as const, stripeCheckoutSessionId: null };
    expect(refundRoute({ ...card, stripePaymentIntentId: "pi_123" })).toEqual({ via: "stripe", paymentIntent: "pi_123" });
    expect(refundRoute({ ...card, stripePaymentIntentId: "pi_123:inv_abc" })).toEqual({ via: "stripe", paymentIntent: "pi_123" }); // "Pay all": one row per invoice
    expect(refundRoute({ ...card, stripePaymentIntentId: "cs_9" })).toEqual({ via: "stripe", checkoutSession: "cs_9" }); // session with no intent
    expect(refundRoute({ method: "CARD", stripePaymentIntentId: null, stripeCheckoutSessionId: "cs_7" })).toEqual({ via: "stripe", checkoutSession: "cs_7" });
    expect(refundRoute({ ...card, stripePaymentIntentId: null }).via).toBe("none");
    for (const method of ["CASH", "ETRANSFER", "CHEQUE", "OTHER"] as const) expect(refundRoute({ method, stripePaymentIntentId: null, stripeCheckoutSessionId: null })).toEqual({ via: "manual" });
  });
  it("the idempotency key is the same for a repeat of the same refund and different for the next one", () => {
    expect(refundIdempotencyKey("p1", 0, 1000)).toBe(refundIdempotencyKey("p1", 0, 1000));
    expect(refundIdempotencyKey("p1", 1000, 1000)).not.toBe(refundIdempotencyKey("p1", 0, 1000));
    expect(refundIdempotencyKey("p2", 0, 1000)).not.toBe(refundIdempotencyKey("p1", 0, 1000));
  });
});

describe("overpayments", () => {
  it("the invoice takes its balance, the rest becomes credit", () => {
    expect(splitOverpayment(3500, 5000)).toEqual({ appliedCents: 3500, creditCents: 1500 });
    expect(splitOverpayment(3500, 3500)).toEqual({ appliedCents: 3500, creditCents: 0 });
    expect(splitOverpayment(3500, 1000)).toEqual({ appliedCents: 1000, creditCents: 0 });
    expect(splitOverpayment(0, 1000)).toEqual({ appliedCents: 0, creditCents: 1000 });
    expect(splitOverpayment(-200, 1000)).toEqual({ appliedCents: 0, creditCents: 1000 }); // already overpaid
  });
});

describe("tips", () => {
  it("presets are a percent of the invoice total; custom is dollars; anything else is no tip", () => {
    expect(tipCents(4500, "10")).toBe(450);
    expect(tipCents(4500, "15")).toBe(675);
    expect(tipCents(3333, "20")).toBe(667);
    expect(tipCents(4500, "custom", "7.50")).toBe(750);
    expect(tipCents(4500, "custom", "abc")).toBe(0);
    expect(tipCents(4500, "custom", "-5")).toBe(0);
    expect(tipCents(4500, "custom", "99999")).toBe(MAX_TIP_CENTS);
    expect(tipCents(4500, "")).toBe(0);
    expect(tipCents(4500, "25")).toBe(0);
    expect(tipCents(4500, "1000")).toBe(0);
  });
  it("the webhook reads the tip back from the session and never lets it swallow the payment", () => {
    expect(sessionTip({ tipCents: "450" }, 4950)).toBe(450);
    expect(sessionTip({}, 4950)).toBe(0);
    expect(sessionTip(null, 4950)).toBe(0);
    expect(sessionTip({ tipCents: "-5" }, 4950)).toBe(0);
    expect(sessionTip({ tipCents: "4.5" }, 4950)).toBe(0);
    expect(sessionTip({ tipCents: "4950" }, 4950)).toBe(0);
  });
});

describe("statement range", () => {
  it("parses the three ranges and round-trips through the query string", () => {
    expect(parseStatementRange({})).toEqual({ range: "lifetime" });
    expect(parseStatementRange({ range: "zero" })).toEqual({ range: "zero" });
    expect(parseStatementRange({ range: "from", from: "2026-01-05" })).toEqual({ range: "from", from: "2026-01-05" });
    expect(parseStatementRange({ range: "from", from: "nope" })).toEqual({ range: "lifetime" });
    expect(statementQuery({ range: "from", from: "2026-01-05" })).toBe("range=from&from=2026-01-05");
    expect(statementQuery({ range: "zero" })).toBe("range=zero");
  });
});

const BIZ = { name: "etc.", legalName: "Every Task Counts Inc.", mailingAddress: "12 Snowpack Rd SW\nCalgary AB", phone: "403-555-0100", helpEmail: "help@example.com", website: "https://example.com", etransferEmail: "pay@example.com", taxRegistered: false, taxName: "GST", taxRateBps: 500, taxNumber: "123456789 RT0001", pricesIncludeTax: true };
describe("pdf", () => {
  it("business block: name, legal name, address lines, contact; GST number only when registered", () => {
    expect(businessLines(BIZ)).toEqual(["etc.", "Every Task Counts Inc.", "12 Snowpack Rd SW", "Calgary AB", "403-555-0100  ·  help@example.com  ·  example.com"]);
    expect(businessLines({ ...BIZ, taxRegistered: true }).at(-1)).toBe("GST # 123456789 RT0001");
  });
  it("totals follow the tax settings", () => {
    const t = { subtotalCents: 10000, discountCents: 0, taxCents: 0, totalCents: 10000 };
    expect(totalRows(BIZ, t, 0).map((r) => r.label)).toEqual(["Total", "Paid", "Balance due"]); // not registered: no GST line at all
    expect(totalRows({ ...BIZ, taxRegistered: true, pricesIncludeTax: false }, { ...t, taxCents: 500, totalCents: 10500 }, 2500)).toEqual([
      { label: "Subtotal", value: "$100" }, { label: "GST (5%)", value: "$5" }, { label: "Total", value: "$105", bold: true }, { label: "Paid", value: "-$25" }, { label: "Balance due", value: "$80", bold: true },
    ]);
    expect(totalRows({ ...BIZ, taxRegistered: true }, { ...t, discountCents: 1000, taxCents: 429, totalCents: 9000 }).map((r) => `${r.label} ${r.value}`)).toEqual(["Subtotal $100", "Discount -$10", "Total $90", "Includes GST (5%) $4.29"]);
  });
  it("text the standard fonts can't draw is replaced, never thrown", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const clean = cleaner(font);
    expect(clean("Café · 2 × $30 — “done”")).toBe("Café · 2 × $30 — “done”");
    expect(clean("−$5 → 雪 ❄️\tok\r\nnext")).toBe("-$5 -> ? ? ok\nnext");
  });
  it("renders a real PDF, with page breaks for long documents and awkward text", async () => {
    const doc: PdfDoc = {
      title: "Invoice", number: "#42", badge: "PAID", business: businessLines(BIZ), to: ["Zoë 雪 Müller", "12 Snowpack Rd SW, Calgary"], meta: [["Issued", "Dec 4, 2026"], ["Due", "Dec 11, 2026"]],
      subject: "Snow clearing · December storm",
      table: { columns: [{ label: "Description" }, { label: "Service date", width: 84 }, { label: "Amount", width: 76, align: "right" }], rows: [{ cells: ["Driveway clearing", "Dec 3, 2026", "$45"], sub: "Front walk included" }] },
      totals: [{ label: "Total", value: "$45", bold: true }], notes: [{ heading: "Message", body: "Thanks! ❄️\nSee you next storm." }, { heading: "Empty", body: "" }], footer: "etc. · example.com",
    };
    const one = await renderPdf(doc);
    expect(Buffer.from(one.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(one)).getPageCount()).toBe(1);
    const long = await renderPdf({ ...doc, table: { ...doc.table, rows: Array.from({ length: 90 }, (_, i) => ({ cells: [`Visit ${i + 1} ${"a-very-long-unbroken-word".repeat(6)}`, "Dec 3, 2026", "$45"], sub: "note" })) }, notes: [{ heading: "Message", body: "line\n".repeat(120) }] });
    expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(3);
  });
});
