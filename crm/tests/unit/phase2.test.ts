import { describe, expect, it } from "vitest";
import { mergeFeed, type FeedItem } from "@/server/activity";
import { ledger } from "@/server/billing/ledger";
import { cleanContactPoints, numbersOf } from "@/server/clients";
import { cdrToCall } from "@/server/ops/calls";
import { parseTypes } from "@/components/activity-feed";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("ledger", () => {
  it("adds sent invoices, subtracts payments net of refunds, skips drafts/voids, keeps a running balance", () => {
    const r = ledger(
      [
        { id: "a", number: 1, status: "PAID", totalCents: 3500, issuedOn: d("2026-12-01"), createdAt: d("2026-12-01") },
        { id: "b", number: 2, status: "AWAITING_PAYMENT", totalCents: 6000, issuedOn: d("2026-12-05"), createdAt: d("2026-12-05") },
        { id: "c", number: 3, status: "DRAFT", totalCents: 999, issuedOn: null, createdAt: d("2026-12-06") },
        { id: "v", number: 4, status: "VOID", totalCents: 999, issuedOn: d("2026-12-06"), createdAt: d("2026-12-06") },
      ],
      [{ id: "p", invoiceId: "a", amountCents: 4000, refundedCents: 500, receivedAt: d("2026-12-02"), method: "ETRANSFER" }],
    );
    expect(r.rows.map((x) => [x.label.split(" ")[0], x.balanceCents])).toEqual([["Invoice", 3500], ["Payment", 0], ["Invoice", 6000]]);
    expect(r.balanceCents).toBe(6000);
  });
  it("can start from a date with an opening balance", () => {
    const r = ledger([{ id: "a", number: 1, status: "AWAITING_PAYMENT", totalCents: 3500, issuedOn: d("2026-11-01"), createdAt: d("2026-11-01") }], [], d("2026-12-01"));
    expect(r).toMatchObject({ rows: [], openingCents: 3500, balanceCents: 3500 });
  });
});

describe("activity merge", () => {
  const it_ = (id: string, at: string, type: FeedItem["type"]): FeedItem => ({ id, at: new Date(at), type, object: "note", title: id });
  it("orders newest first, filters by type, and pages", () => {
    const out = mergeFeed([[it_("a", "2026-12-01", "note"), it_("b", "2026-12-03", "text")], [it_("c", "2026-12-02", "call")]], ["note", "text"], 10);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
    expect(mergeFeed([[it_("a", "2026-12-01", "note"), it_("b", "2026-12-03", "note")]], ["note"], 1).map((x) => x.id)).toEqual(["b"]);
  });
  it("parses type filters from the URL", () => {
    expect(parseTypes("text,call")).toEqual(["text", "call"]);
    expect(parseTypes("bogus")).toHaveLength(6);
  });
});

describe("clients", () => {
  it("cleans phone/email rows: blanks dropped, numbers normalized and deduped, bad emails rejected", () => {
    expect(cleanContactPoints({ phones: [{ number: "403-555-0101", label: "Mobile", sms: true }, { number: "(403) 555 0101", label: "Home", sms: false }, { number: "", label: "Work", sms: false }], emails: [{ address: "", label: "Main" }] }))
      .toEqual({ phones: [{ number: "+14035550101", label: "Mobile", sms: true }], emails: [] });
    expect(() => cleanContactPoints({ phones: [], emails: [{ address: "nope", label: "Main" }] })).toThrow(/isn't an email/);
  });
  it("collects every number a client can be reached at", () => {
    expect(numbersOf({ phone: "403-555-0101", phones: [{ number: "+14035550101" }, { number: "587 555 0102" }], contacts: [{ phone: "(825) 555-0103" }, { phone: null }] }))
      .toEqual(["+14035550101", "+15875550102", "+18255550103"]);
  });
});

describe("Telnyx call records", () => {
  const ours = "+14036568200";
  it("keeps the inbound leg of a forwarded call, drops the forward leg, and marks 0-second calls missed", () => {
    expect(cdrToCall({ id: "1", direction: "inbound", cli: "+17097699078", cld: ours, started_at: "2026-11-27T17:24:54Z", call_sec: 15 }, ours))
      .toMatchObject({ providerId: "1", direction: "IN", from: "+17097699078", status: "answered", durationSec: 15 });
    expect(cdrToCall({ id: "2", direction: "outbound", cli: "+17097699078", cld: ours, call_sec: 15 }, ours)).toBeNull();
    expect(cdrToCall({ id: "3", direction: "inbound", cli: "+17097699078", cld: ours, call_sec: 0, hangup_cause: "PROGRESS_TIMEOUT" }, ours)).toMatchObject({ status: "missed", durationSec: null });
    expect(cdrToCall({ id: "4", direction: "inbound", cli: "+15550000000", cld: "+18254794500", call_sec: 5 }, ours)).toBeNull();
  });
});

import { seriesDates } from "@/server/ops/tasks";
describe("task repeats", () => {
  it("builds daily, weekly, every-2-weeks and monthly series, capped at a year", () => {
    expect(seriesDates("2026-12-01", null)).toEqual(["2026-12-01"]);
    expect(seriesDates("2026-12-01", "WEEKLY", "2026-12-22")).toEqual(["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22"]);
    expect(seriesDates("2026-12-01", "BIWEEKLY", "2026-12-31")).toEqual(["2026-12-01", "2026-12-15", "2026-12-29"]);
    expect(seriesDates("2027-01-31", "MONTHLY", "2027-04-30")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(seriesDates("2026-12-01", "DAILY").length).toBe(120);
    expect(seriesDates("2026-12-01", "WEEKLY").length).toBe(53);
  });
});

import { profitOf } from "@/server/ops/costing";
describe("job profit", () => {
  it("subtracts labour at each person's rate and expenses from revenue", () => {
    expect(profitOf(12000, [{ minutes: 90, hourlyCostCents: 2000 }, { minutes: 30, hourlyCostCents: 1500 }, { minutes: null, hourlyCostCents: 9999 }], [{ amountCents: 1500 }]))
      .toEqual({ revenueCents: 12000, labourCents: 3750, expenseCents: 1500, profitCents: 6750, marginPct: 56, minutes: 120 });
    expect(profitOf(0, [], [{ amountCents: 500 }])).toMatchObject({ profitCents: -500, marginPct: null });
  });
});

import { missingRequired } from "@/server/ops/checklists";
describe("checklists", () => {
  const items = [
    { id: "a", label: "Driveway", type: "CHECKBOX" as const, required: true, showClient: true },
    { id: "b", label: "Ice melt", type: "YESNO" as const, required: true, showClient: true },
    { id: "c", label: "Windows", type: "NUMBER" as const, required: true, showClient: true },
    { id: "d", label: "After photo", type: "PHOTO" as const, required: true, showClient: false },
    { id: "e", label: "Notes", type: "TEXT" as const, required: false, showClient: false },
  ];
  it("lists required items still missing, counting tagged photos", () => {
    expect(missingRequired(items, {}, [])).toEqual(["Driveway", "Ice melt", "Windows", "After photo"]);
    expect(missingRequired(items, { a: true, b: "no", c: 0 }, ["checklist:d"])).toEqual([]);
    expect(missingRequired(items, { a: false, b: "maybe", c: "" }, ["checklist:x"])).toEqual(["Driveway", "Ice melt", "Windows", "After photo"]);
  });
});

import { decodeSignature, docHash, inkPixels } from "@/server/ops/signatures";
describe("signatures", () => {
  it("rejects anything that isn't a reasonable PNG data URL", () => {
    expect(() => decodeSignature("not a data url")).toThrow();
    expect(() => decodeSignature("data:image/png;base64,AAAA")).toThrow(); // too small
    expect(decodeSignature(`data:image/png;base64,${Buffer.alloc(200, 1).toString("base64")}`).length).toBe(200);
  });
  it("counts only dark, opaque pixels as ink", () => {
    const raw = new Uint8Array([20, 30, 60, 255, 255, 255, 255, 255, 10, 10, 10, 0, 0, 0, 0, 200]);
    expect(inkPixels(raw)).toBe(2);
  });
  it("hashes the document deterministically", () => {
    expect(docHash({ a: 1, l: [["x", "1", 100]] })).toBe(docHash({ a: 1, l: [["x", "1", 100]] }));
    expect(docHash({ a: 1 })).not.toBe(docHash({ a: 2 }));
  });
});

import { depositCents, depositCredit } from "@/server/billing/invoice";
describe("deposits", () => {
  it("works out the deposit from a percent or a fixed amount, capped at the total", () => {
    expect(depositCents(50000, "PERCENT", 25)).toBe(12500);
    expect(depositCents(50000, "FIXED", 10000)).toBe(10000);
    expect(depositCents(5000, "FIXED", 10000)).toBe(5000);
    expect(depositCents(50000, "NONE", 50)).toBe(0);
  });
  it("credits paid deposits against an invoice without going below zero", () => {
    expect(depositCredit(30000, [{ id: "a", paidCents: 12500 }])).toEqual([{ id: "a", cents: 12500 }]);
    expect(depositCredit(10000, [{ id: "a", paidCents: 12500 }, { id: "b", paidCents: 500 }])).toEqual([{ id: "a", cents: 10000 }]);
    expect(depositCredit(30000, [])).toEqual([]);
  });
});

import { decodeAlloc, encodeAlloc, splitRefund } from "@/server/stripe";
describe("stripe pay-all", () => {
  it("round-trips the per-invoice split through metadata and ignores junk", () => {
    const a = [{ invoiceId: "inv_a", cents: 3500 }, { invoiceId: "inv_b", cents: 6000 }];
    expect(decodeAlloc(encodeAlloc(a))).toEqual(a);
    expect(decodeAlloc("x:1.5,y:,z:200")).toEqual([{ invoiceId: "z", cents: 200 }]);
    expect(encodeAlloc(Array.from({ length: 10 }, (_, i) => ({ invoiceId: `c${"x".repeat(24)}${i}`, cents: 999999 }))).length).toBeLessThan(500);
  });
  it("spreads a refund newest-first and only adds what's new", () => {
    const rows = [{ id: "a", amountCents: 3500, refundedCents: 0 }, { id: "b", amountCents: 6000, refundedCents: 0 }];
    expect(splitRefund(rows, 7000)).toEqual([{ id: "b", refundedCents: 6000 }, { id: "a", refundedCents: 1000 }]);
    expect(splitRefund([{ id: "a", amountCents: 3500, refundedCents: 1000 }], 1000)).toEqual([]);
  });
});

import { makeReferralCode, reviewRoute } from "@/server/ops/marketing";
describe("reviews and referrals", () => {
  it("sends 4-5 stars to Google and 1-3 to private feedback", () => {
    expect([1, 2, 3, 4, 5].map(reviewRoute)).toEqual(["feedback", "feedback", "feedback", "google", "google"]);
  });
  it("makes readable referral codes from the first name", () => {
    expect(makeReferralCode("Jane", Buffer.from([0, 1, 2, 3]))).toBe("JANE2345");
    expect(makeReferralCode("Zoë-Ann", Buffer.from([31, 31, 31, 31]))).toBe("ZOEANNZZZZ");
    expect(makeReferralCode("", Buffer.from([0, 0, 0, 0]))).toBe("ETC2222");
  });
});

import { emailConsent, nextTextWindow, paceDay, signed, smsConsent, verifySigned } from "@/server/ops/campaigns";
describe("campaigns", () => {
  const now = new Date("2026-12-01T18:00:00Z");
  const base = { email: "a@b.c", marketingOptOut: false, emailBouncedAt: null, emailMarketingConsentAt: null };
  it("applies CASL consent: express, or a purchase within 2 years / inquiry within 6 months", () => {
    expect(emailConsent({ ...base, emailMarketingConsentAt: new Date("2020-01-01") }, null, null, now)).toBe("express");
    expect(emailConsent(base, new Date("2025-06-01"), null, now)).toBe("implied-purchase");
    expect(emailConsent(base, new Date("2024-06-01"), null, now)).toBeNull();
    expect(emailConsent(base, null, new Date("2026-09-01"), now)).toBe("implied-inquiry");
    expect(emailConsent(base, null, new Date("2026-03-01"), now)).toBeNull();
    expect(emailConsent({ ...base, marketingOptOut: true }, new Date("2026-11-01"), null, now)).toBeNull();
  });
  it("only texts people who opted in and haven't replied STOP", () => {
    expect(smsConsent({ phone: "403-555-0101", smsOptIn: true, smsOptOutAt: null, marketingOptOut: false })).toBe(true);
    expect(smsConsent({ phone: "403-555-0101", smsOptIn: true, smsOptOutAt: new Date(), marketingOptOut: false })).toBe(false);
    expect(smsConsent({ phone: null, smsOptIn: true, smsOptOutAt: null, marketingOptOut: false })).toBe(false);
  });
  it("holds texts between 9pm and 9am Calgary time", () => {
    const noon = new Date("2026-12-01T18:00:00Z"); // 11am MST
    expect(nextTextWindow(noon)).toBe(noon);
    expect(nextTextWindow(new Date("2026-12-02T05:00:00Z")).toISOString()).toBe("2026-12-02T15:00:00.000Z"); // 10pm -> 9am next day (UTC-6 from Nov 2026)
    expect(nextTextWindow(new Date("2026-12-02T12:00:00Z")).toISOString()).toBe("2026-12-02T15:00:00.000Z"); // 5am -> 9am same day
  });
  it("paces emails per day and signs links", () => {
    expect([0, 199, 200, 450].map((i) => paceDay(i, 200))).toEqual([0, 0, 1, 2]);
    expect(verifySigned(signed("client123"))).toBe("client123");
    expect(verifySigned("client123.forged")).toBeNull();
  });
});
