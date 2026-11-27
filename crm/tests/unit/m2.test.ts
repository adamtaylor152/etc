import { describe, expect, it } from "vitest";
import { chargesForVisit } from "@/server/billing/charges";
import { plansTriggered } from "@/server/snow/select";
import { assertTransition, canTransition } from "@/server/status/visit";

describe("visit transitions", () => {
  it("allows the field flow and reopening", () => {
    expect(canTransition("SCHEDULED", "EN_ROUTE")).toBe(true);
    expect(canTransition("EN_ROUTE", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "SCHEDULED")).toBe(true);
  });
  it("blocks nonsense", () => {
    expect(() => assertTransition("COMPLETED", "SKIPPED")).toThrow();
    expect(() => assertTransition("CANCELLED", "COMPLETED")).toThrow();
    expect(() => assertTransition("IN_PROGRESS", "CANCELLED")).toThrow();
  });
});

const plan = { kind: "SNOW_PLAN" as const, billingType: "PER_VISIT" as const, pricePerPushCents: 3000, iceMelt: true, lineItems: [] };
describe("chargesForVisit", () => {
  it("per push: $30 + ice melt every push", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_PUSH" }, { pushNumber: 2, iceMeltApplied: null }, 500))
      .toEqual([
        { name: "Snow clearing (per push)", quantity: 1, unitPriceCents: 3000, totalCents: 3000 },
        { name: "Ice melt", quantity: 1, unitPriceCents: 500, totalCents: 500 },
      ]);
  });
  it("crew can say ice melt wasn't used", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_PUSH" }, { pushNumber: 1, iceMeltApplied: false }, 500)).toHaveLength(1);
  });
  it("per event: only push 1 charges", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_EVENT" }, { pushNumber: 1, iceMeltApplied: null }, 500)).toHaveLength(2);
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_EVENT" }, { pushNumber: 2, iceMeltApplied: null }, 500)).toEqual([]);
  });
  it("seasonal and fixed price charge nothing per visit", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "SEASONAL" }, { pushNumber: 1, iceMeltApplied: true }, 500)).toEqual([]);
    expect(chargesForVisit({ ...plan, kind: "ONE_OFF", billingType: "FIXED_PRICE", snowBillingMode: null }, { pushNumber: null, iceMeltApplied: null }, 500)).toEqual([]);
  });
  it("one-off per visit uses the job's per-visit line items", () => {
    const job = { ...plan, kind: "ONE_OFF" as const, snowBillingMode: null, lineItems: [
      { name: "Snow shovelling (one-time)", quantity: 1, unitPriceCents: 3500, perVisit: true },
      { name: "Ice melt", quantity: 1, unitPriceCents: 500, perVisit: true },
      { name: "Setup fee", quantity: 1, unitPriceCents: 1000, perVisit: false },
    ] };
    expect(chargesForVisit(job, { pushNumber: null, iceMeltApplied: null }, 500).map((c) => c.totalCents)).toEqual([3500, 500]);
    expect(chargesForVisit(job, { pushNumber: null, iceMeltApplied: false }, 500).map((c) => c.totalCents)).toEqual([3500]);
  });
});

describe("plansTriggered", () => {
  const p = (id: string, triggerCm: number | null, extra = {}) => ({ id, triggerCm, planPausedAt: null, closedAt: null, ...extra });
  const plans = [p("default", null), p("five", 5), p("paused", 1, { planPausedAt: new Date() }), p("closed", 1, { closedAt: new Date() })];
  it.each([[1, []], [2, ["default"]], [4, ["default"]], [5, ["default", "five"]]])("%i cm -> %j", (cm, ids) => {
    expect(plansTriggered(plans, cm as number, 2).map((x) => x.id)).toEqual(ids);
  });
});
