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

const plan = { kind: "SNOW_PLAN" as const, billingType: "PER_VISIT" as const, pricePerPushCents: 3000, iceMelt: true, addonsIncluded: false, lineItems: [] };
describe("chargesForVisit", () => {
  it("per push: $30 + ice melt every push", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: null, stormCharged: true }, 500))
      .toEqual([
        { name: "Snow clearing (per push)", quantity: 1, unitPriceCents: 3000, totalCents: 3000 },
        { name: "Ice melt", quantity: 1, unitPriceCents: 500, totalCents: 500 },
      ]);
  });
  it("crew can say ice melt wasn't used", () => {
    expect(chargesForVisit({ ...plan, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: false }, 500)).toHaveLength(1);
  });
  it("per event: one clearing charge per storm, whichever push is done first", () => {
    const event = { ...plan, snowBillingMode: "PER_EVENT" as const };
    expect(chargesForVisit(event, { iceMeltApplied: null }, 500).map((c) => [c.name, c.totalCents])).toEqual([["Snow clearing (storm)", 3000], ["Ice melt", 500]]);
    // Later pushes of a storm that's already charged: the clearing is free, ice melt is still per visit.
    expect(chargesForVisit(event, { iceMeltApplied: null, stormCharged: true }, 500).map((c) => c.name)).toEqual(["Ice melt"]);
    expect(chargesForVisit(event, { iceMeltApplied: false, stormCharged: true }, 500)).toEqual([]);
    expect(chargesForVisit({ ...event, iceMelt: false }, { iceMeltApplied: null, stormCharged: true }, 500)).toEqual([]);
  });
  it("seasonal: no clearing charge; ice melt only when it isn't included in the season price", () => {
    const seasonal = { ...plan, snowBillingMode: "SEASONAL" as const };
    expect(chargesForVisit({ ...seasonal, addonsIncluded: true }, { iceMeltApplied: true }, 500)).toEqual([]);
    expect(chargesForVisit(seasonal, { iceMeltApplied: true }, 500)).toEqual([{ name: "Ice melt", quantity: 1, unitPriceCents: 500, totalCents: 500 }]);
    expect(chargesForVisit(seasonal, { iceMeltApplied: false }, 500)).toEqual([]);
  });
  it("fixed price charges nothing per visit", () => {
    expect(chargesForVisit({ ...plan, kind: "ONE_OFF", billingType: "FIXED_PRICE", snowBillingMode: null }, { iceMeltApplied: null }, 500)).toEqual([]);
  });
  it("one-off per visit uses the job's per-visit line items", () => {
    const job = { ...plan, kind: "ONE_OFF" as const, snowBillingMode: null, lineItems: [
      { name: "Snow shovelling (one-time)", quantity: 1, unitPriceCents: 3500, perVisit: true },
      { name: "Ice melt", quantity: 1, unitPriceCents: 500, perVisit: true },
      { name: "Setup fee", quantity: 1, unitPriceCents: 1000, perVisit: false },
    ] };
    expect(chargesForVisit(job, { iceMeltApplied: null }, 500).map((c) => c.totalCents)).toEqual([3500, 500]);
    expect(chargesForVisit(job, { iceMeltApplied: false }, 500).map((c) => c.totalCents)).toEqual([3500]);
  });
});

describe("plansTriggered", () => {
  const p = (id: string, triggerCm: number | null, extra = {}) => ({ id, triggerCm, planPausedAt: null, closedAt: null, ...extra });
  const plans = [p("default", null), p("five", 5), p("paused", 1, { planPausedAt: new Date() }), p("closed", 1, { closedAt: new Date() })];
  it.each([[1, []], [2, ["default"]], [4, ["default"]], [5, ["default", "five"]]])("%i cm -> %j", (cm, ids) => {
    expect(plansTriggered(plans, cm as number, 2).map((x) => x.id)).toEqual(ids);
  });
});

import { signedMediaPath, verifyMediaSig } from "@/server/media";
describe("signed media URLs", () => {
  const parse = (p: string) => { const u = new URL(p, "http://x"); return [u.searchParams.get("exp"), u.searchParams.get("sig")] as const; };
  it("verifies, rejects tampering, other variants and expiry", () => {
    const now = Date.UTC(2026, 10, 27);
    const [exp, sig] = parse(signedMediaPath("abc", "md", 1, now));
    expect(verifyMediaSig("abc", "md", exp, sig, now)).toBe(true);
    expect(verifyMediaSig("abd", "md", exp, sig, now)).toBe(false);
    expect(verifyMediaSig("abc", "lg", exp, sig, now)).toBe(false);
    expect(verifyMediaSig("abc", "md", String(Number(exp) + 1), sig, now)).toBe(false);
    expect(verifyMediaSig("abc", "md", exp, sig, now + 2 * 86_400_000)).toBe(false);
    expect(verifyMediaSig("abc", "md", null, null, now)).toBe(false);
  });
});
