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
