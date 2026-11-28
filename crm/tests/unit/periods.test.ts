import { describe, expect, it } from "vitest";
import { chargesForVisit, parseOverrides } from "@/server/billing/charges";
import { isInvoiceDay, periodKey, periodLabel, periodsDue, recurringBillingError } from "@/server/billing/periods";
import { visitLinesLock } from "@/server/status/job";

describe("fixed price per month: which periods are due", () => {
  const terms = { startsOn: "2027-03-10", endsOn: null, invoiceDay: null };
  const periods = (t: Parameters<typeof periodsDue>[0], today: string) => periodsDue(t, today).map((p) => `${p.period}@${p.dueOn.slice(8)}`);
  it("nothing before the job starts; the first month is due on the start day", () => {
    expect(periods(terms, "2027-03-09")).toEqual([]);
    expect(periods(terms, "2027-03-10")).toEqual(["2027-03@10"]);
  });
  it("each later month on the 1st, across a year end, however late the run is", () => {
    expect(periods(terms, "2027-03-31")).toEqual(["2027-03@10"]);
    expect(periods(terms, "2027-04-01")).toEqual(["2027-03@10", "2027-04@01"]);
    expect(periods({ ...terms, startsOn: "2027-11-20" }, "2028-02-03")).toEqual(["2027-11@20", "2027-12@01", "2028-01@01", "2028-02@01"]);
  });
  it("a chosen invoice day", () => {
    const t = { ...terms, invoiceDay: 15 };
    expect(periods(t, "2027-03-14")).toEqual([]);
    expect(periods(t, "2027-04-14")).toEqual(["2027-03@15"]);
    expect(periods(t, "2027-04-15")).toEqual(["2027-03@15", "2027-04@15"]);
    expect(periods({ ...t, startsOn: "2027-03-20" }, "2027-03-20")).toEqual(["2027-03@20"]); // started after the invoice day
  });
  it("stops with the last visit's month", () => {
    const t = { ...terms, endsOn: "2027-05-04", invoiceDay: 15 };
    expect(periods(t, "2027-09-01")).toEqual(["2027-03@15", "2027-04@15", "2027-05@15"]);
    expect(periods(t, "2027-05-10")).toEqual(["2027-03@15", "2027-04@15"]);
  });
  it("a month paused from its first day to its last is not billed; a partly paused month is", () => {
    expect(periods({ ...terms, pausedFrom: "2027-04-01", pausedUntil: "2027-05-31" }, "2027-06-01")).toEqual(["2027-03@10", "2027-06@01"]);
    expect(periods({ ...terms, pausedFrom: "2027-04-02", pausedUntil: "2027-05-30" }, "2027-06-01")).toEqual(["2027-03@10", "2027-04@01", "2027-05@01", "2027-06@01"]);
  });
  it("is the same answer on every run, and each period has one key", () => {
    expect(periodsDue(terms, "2027-06-01")).toEqual(periodsDue(terms, "2027-06-01"));
    const keys = periodsDue(terms, "2027-06-01").map((p) => periodKey("job1", p.period));
    expect(keys).toEqual(["job1:2027-03", "job1:2027-04", "job1:2027-05", "job1:2027-06"]);
    expect(periodLabel("2027-03")).toBe("March 2027");
  });
});

describe("recurring billing choices", () => {
  it("a fixed monthly price can't be invoiced after each visit; the invoice day is 1 to 28", () => {
    expect(recurringBillingError({ method: "FIXED_PRICE", when: "AFTER_EACH_VISIT" })).toMatch(/once a month/);
    expect(recurringBillingError({ method: "FIXED_PRICE", when: "MONTHLY", invoiceDay: 15 })).toBeNull();
    expect(recurringBillingError({ method: "PER_VISIT", when: "AFTER_EACH_VISIT" })).toBeNull();
    expect(recurringBillingError({ method: "PER_VISIT", when: "MONTHLY", invoiceDay: 29 })).toMatch(/1 to 28/);
  });
  it("monthly invoices go out on the job's day, the 1st by default", () => {
    expect(isInvoiceDay("2027-04-01", null)).toBe(true);
    expect(isInvoiceDay("2027-04-15", null)).toBe(false);
    expect(isInvoiceDay("2027-04-15", 15)).toBe(true);
    expect(isInvoiceDay("2027-04-01", 15)).toBe(false);
  });
});

describe("one visit's own price", () => {
  const job = { kind: "RECURRING" as const, billingType: "PER_VISIT" as const, snowBillingMode: null, pricePerPushCents: null, iceMelt: false, addonsIncluded: false,
    lineItems: [{ name: "Bin cleaning", quantity: 1, unitPriceCents: 2500, perVisit: true }] };
  const extra = [{ name: "Bin cleaning", quantity: 1, unitPriceCents: 2500 }, { name: "Extra bin", quantity: 2, unitPriceCents: 1000 }];
  it("override lines are charged instead of the job's; none = the job's", () => {
    expect(chargesForVisit(job, { iceMeltApplied: null, overrides: extra }, 500).map((c) => [c.name, c.totalCents])).toEqual([["Bin cleaning", 2500], ["Extra bin", 2000]]);
    expect(chargesForVisit(job, { iceMeltApplied: null, overrides: null }, 500).map((c) => c.totalCents)).toEqual([2500]);
    expect(chargesForVisit(job, { iceMeltApplied: null, overrides: [] }, 500).map((c) => c.totalCents)).toEqual([2500]);
  });
  it("a fixed price per month charges nothing per visit, override or not; snow plans ignore overrides", () => {
    expect(chargesForVisit({ ...job, billingType: "FIXED_PRICE" }, { iceMeltApplied: null, overrides: extra }, 500)).toEqual([]);
    expect(chargesForVisit({ ...job, kind: "SNOW_PLAN", snowBillingMode: "PER_PUSH", pricePerPushCents: 3000 }, { iceMeltApplied: null, overrides: extra }, 500).map((c) => c.totalCents)).toEqual([3000]);
  });
  it("reads stored overrides defensively", () => {
    expect(parseOverrides(extra)).toEqual(extra);
    expect(parseOverrides(null)).toBeNull();
    expect(parseOverrides([])).toBeNull();
    expect(parseOverrides([{ name: "x", quantity: 1 }])).toBeNull();
  });
  it("can change only while the visit is still to do and nothing is invoiced", () => {
    const v = { state: "SCHEDULED" as const, invoiced: false, kind: "RECURRING" as const, billingType: "PER_VISIT" as const, closedAt: null };
    expect(visitLinesLock(v)).toBeNull();
    expect(visitLinesLock({ ...v, state: "IN_PROGRESS" })).toBeNull();
    expect(visitLinesLock({ ...v, state: "COMPLETED", invoiced: true })).toMatch(/already invoiced/);
    expect(visitLinesLock({ ...v, state: "COMPLETED" })).toMatch(/Reopen/);
    expect(visitLinesLock({ ...v, state: "SKIPPED" })).toMatch(/Reopen/);
    expect(visitLinesLock({ ...v, billingType: "FIXED_PRICE" })).toMatch(/fixed price/);
    expect(visitLinesLock({ ...v, kind: "SNOW_PLAN" })).toMatch(/plan/);
    expect(visitLinesLock({ ...v, closedAt: new Date() })).toMatch(/closed/);
  });
});
