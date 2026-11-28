import { describe, expect, it } from "vitest";
import { chargesForVisit } from "@/server/billing/charges";
import { planProfit } from "@/server/ops/costing";
import { onSiteMinutes, usualMinutes } from "@/server/ops/visit-times";
import { routeTimes } from "@/server/routing/eta";
import { SettingsSchema } from "@/server/settings";
import { describeTiers, parseTiers, returnVisitPrice, tierBands, tierFor, tiersFromRows } from "@/server/snow/tiers";

const tiers = [{ overCm: 10, addCents: 1500 }, { overCm: 20, addCents: 3000 }];
const plan = { kind: "SNOW_PLAN" as const, billingType: "PER_VISIT" as const, pricePerPushCents: 3000, iceMelt: false, addonsIncluded: false, lineItems: [], depthTiers: tiers };
const named = (job: Parameters<typeof chargesForVisit>[0], visit: Parameters<typeof chargesForVisit>[1]) => chargesForVisit(job, visit, 500).map((c) => [c.name, c.totalCents]);

describe("depth tiers", () => {
  it("names the bands, base first", () => {
    expect(tierBands(tiers)).toEqual([{ label: "up to 10 cm", addCents: 0 }, { label: "11–20 cm", addCents: 1500 }, { label: "over 20 cm", addCents: 3000 }]);
    expect(describeTiers(tiers, 3000, (c) => `$${c / 100}`)).toBe("up to 10 cm $30 · 11–20 cm $45 · over 20 cm $60");
    expect(tierBands([])).toEqual([]);
  });
  it("a depth exactly on a threshold stays in the lower band", () => {
    expect([0, 10, 11, 20, 21, 80].map((cm) => tierFor(tiers, cm)?.addCents)).toEqual([0, 0, 1500, 1500, 3000, 3000]);
  });
  it("no tiers, or no depth, is no tier at all", () => {
    expect(tierFor([], 30)).toBeNull();
    expect(tierFor(tiers, null)).toBeNull();
    expect(tierFor(tiers, undefined)).toBeNull();
  });
  it("reads stored tiers defensively and sorts them", () => {
    expect(parseTiers([{ overCm: 20, addCents: 3000 }, { overCm: 10, addCents: 1500 }])).toEqual(tiers);
    for (const bad of [null, "x", [], [{ overCm: 10 }], [{ overCm: 10.5, addCents: 1 }], [{ overCm: 0, addCents: 1 }], [{ overCm: 10, addCents: -1 }], [{ overCm: 10, addCents: 1 }, { overCm: 10, addCents: 2 }], Array(5).fill({ overCm: 1, addCents: 1 })]) expect(parseTiers(bad)).toEqual([]);
  });
  it("reads the form rows, dropping blanks and refusing a muddled list", () => {
    expect(tiersFromRows(["10", "", "20", ""], ["15", "", "30.50", ""])).toEqual([{ overCm: 10, addCents: 1500 }, { overCm: 20, addCents: 3050 }]);
    expect(tiersFromRows(["", ""], ["", ""])).toEqual([]);
    expect(() => tiersFromRows(["10", "10"], ["15", "30"])).toThrow(/Depth tiers/);
    expect(() => tiersFromRows(["", ""], ["15", ""])).toThrow(/Depth tiers/);
    expect(() => tiersFromRows(["abc"], ["15"])).toThrow(/Depth tiers/);
  });
  it("settings start with no tiers and a half-price return visit", () => {
    expect(SettingsSchema.parse({})).toMatchObject({ depthTiers: [], returnVisitPct: 50 });
  });
});

describe("chargesForVisit with depth tiers", () => {
  it("per push: the clearing charge is the tier for the depth, and says which", () => {
    const push = { ...plan, snowBillingMode: "PER_PUSH" as const };
    expect(named(push, { iceMeltApplied: null, depthCm: 8 })).toEqual([["Snow clearing (per push), up to 10 cm", 3000]]);
    expect(named(push, { iceMeltApplied: null, depthCm: 10 })).toEqual([["Snow clearing (per push), up to 10 cm", 3000]]);
    expect(named(push, { iceMeltApplied: null, depthCm: 11 })).toEqual([["Snow clearing (per push), 11–20 cm", 4500]]);
    expect(named(push, { iceMeltApplied: null, depthCm: 20 })).toEqual([["Snow clearing (per push), 11–20 cm", 4500]]);
    expect(named(push, { iceMeltApplied: null, depthCm: 35 })).toEqual([["Snow clearing (per push), over 20 cm", 6000]]);
  });
  it("nobody measured the snow: the plain price under the plain name", () => {
    expect(named({ ...plan, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: null })).toEqual([["Snow clearing (per push)", 3000]]);
    expect(named({ ...plan, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: null, depthCm: null })).toEqual([["Snow clearing (per push)", 3000]]);
  });
  it("no tiers on the plan: exactly as before, whatever the depth", () => {
    for (const depthTiers of [undefined, null, [], "junk"]) {
      expect(named({ ...plan, depthTiers, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: null, depthCm: 40 })).toEqual([["Snow clearing (per push)", 3000]]);
      expect(named({ ...plan, depthTiers, snowBillingMode: "PER_EVENT" }, { iceMeltApplied: null, depthCm: 40 })).toEqual([["Snow clearing (storm)", 3000]]);
    }
  });
  it("per storm: tiered once, on the first push done; later pushes add nothing", () => {
    const event = { ...plan, snowBillingMode: "PER_EVENT" as const };
    expect(named(event, { iceMeltApplied: null, depthCm: 25 })).toEqual([["Snow clearing (storm), over 20 cm", 6000]]);
    expect(named(event, { iceMeltApplied: null, depthCm: 25, stormCharged: true })).toEqual([]);
  });
  it("the tier only moves the clearing: extra sidewalk and ice melt stay as they were", () => {
    const full = { ...plan, snowBillingMode: "PER_PUSH" as const, iceMelt: true, lineItems: [{ name: "Extra sidewalk (corner lot / long walk)", quantity: 1, unitPriceCents: 1000, perVisit: true }] };
    expect(named(full, { iceMeltApplied: null, depthCm: 15 })).toEqual([["Snow clearing (per push), 11–20 cm", 4500], ["Extra sidewalk (corner lot / long walk)", 1000], ["Ice melt", 500]]);
  });
  it("seasonal plans ignore tiers", () => {
    expect(named({ ...plan, snowBillingMode: "SEASONAL", iceMelt: true }, { iceMeltApplied: null, depthCm: 40 })).toEqual([["Ice melt", 500]]);
    expect(named({ ...plan, snowBillingMode: "SEASONAL", addonsIncluded: true, iceMelt: true }, { iceMeltApplied: null, depthCm: 40 })).toEqual([]);
  });
});

describe("return visits", () => {
  it("costs a share of the base price, to the cent", () => {
    expect([returnVisitPrice(3000, 50), returnVisitPrice(3333, 50), returnVisitPrice(3000, 0), returnVisitPrice(3000, 100)]).toEqual([1500, 1667, 0, 3000]);
  });
  it("billable: just the return price, never another clearing, tier or sidewalk", () => {
    const walk = { ...plan, lineItems: [{ name: "Extra sidewalk (corner lot / long walk)", quantity: 1, unitPriceCents: 1000, perVisit: true }] };
    for (const snowBillingMode of ["PER_PUSH", "PER_EVENT", "SEASONAL"] as const) {
      expect(named({ ...walk, snowBillingMode }, { iceMeltApplied: null, isReturn: true, returnPriceCents: 1500, depthCm: 30 })).toEqual([["Return visit", 1500]]);
    }
  });
  it("included: no charge", () => {
    expect(named({ ...plan, snowBillingMode: "PER_PUSH", iceMelt: true }, { iceMeltApplied: null, isReturn: true, returnPriceCents: null })).toEqual([]);
    expect(named({ ...plan, snowBillingMode: "PER_EVENT" }, { iceMeltApplied: null, isReturn: true })).toEqual([]);
  });
  it("ice melt only when the crew put some down, and never on a season price that covers it", () => {
    expect(named({ ...plan, snowBillingMode: "PER_PUSH" }, { iceMeltApplied: true, isReturn: true })).toEqual([["Ice melt", 500]]);
    expect(named({ ...plan, snowBillingMode: "SEASONAL", addonsIncluded: true }, { iceMeltApplied: true, isReturn: true })).toEqual([]);
  });
  it("a one-time snow booking can have one too", () => {
    const once = { ...plan, kind: "ONE_OFF" as const, snowBillingMode: null, depthTiers: null, lineItems: [{ name: "Snow shovelling (one-time)", quantity: 1, unitPriceCents: 3500, perVisit: true }] };
    expect(named(once, { iceMeltApplied: null, isReturn: true, returnPriceCents: 1750 })).toEqual([["Return visit", 1750]]);
  });
});

describe("minutes on site", () => {
  const at = (hm: string) => new Date(`2026-12-01T${hm}:00Z`);
  it("is Arrived to Done when both were tapped", () => {
    expect(onSiteMinutes({ arrivedAt: at("09:00"), completedAt: at("09:22") })).toBe(22);
    expect(onSiteMinutes({ arrivedAt: at("09:00"), completedAt: at("09:00") }, [{ userId: "a", minutes: 9 }])).toBe(9); // no real span: fall back
  });
  it("else the visit's timers: the longest one person ran, not everyone added up", () => {
    expect(onSiteMinutes({ arrivedAt: null, completedAt: at("09:22") }, [{ userId: "a", minutes: 10 }, { userId: "a", minutes: 5 }, { userId: "b", minutes: 12 }])).toBe(15);
    expect(onSiteMinutes({ arrivedAt: null, completedAt: at("09:22") })).toBeNull();
    expect(onSiteMinutes({ arrivedAt: null, completedAt: null }, [{ userId: "a", minutes: null }])).toBeNull();
  });
  it("'usually' needs three timed visits, uses the last ten, and ignores a forgotten Done", () => {
    expect(usualMinutes([12, 16])).toBeNull();
    expect(usualMinutes([12, 16, 14])).toBe(14);
    expect(usualMinutes([12, 16, 600])).toBeNull();
    expect(usualMinutes([...Array(10).fill(10), 100, 100])).toBe(10);
  });
  it("route times take one service time per stop", () => {
    expect(routeTimes([10, 5, 8], [12, 20, 6], 15)).toEqual({ arrive: [10, 27, 55], driveMin: 38, totalMin: 76 });
  });
});

describe("planProfit", () => {
  const at = (hm: string) => new Date(`2026-12-01T${hm}:00Z`);
  const visit = (id: string, o: Partial<Parameters<typeof planProfit>[0]["visits"][number]> = {}) => ({ id, isReturn: false, snowEventId: "s1", arrivedAt: null, completedAt: at("10:00"), completedById: "silas", unbilledCents: 0, ...o });
  const hourlyCost = (id: string) => ({ silas: 2000, helper: 3000 })[id] ?? 0;
  it("adds invoiced and unbilled revenue, and costs labour from timers first, then minutes on site", () => {
    const p = planProfit({
      invoicedCents: 6000, hourlyCost, expenses: [{ amountCents: 700 }],
      visits: [
        visit("v1"),                                                               // timed: 30 min by the helper
        visit("v2", { arrivedAt: at("09:30"), unbilledCents: 3000 }),               // on site 30 min, completed by silas
        visit("v3", { snowEventId: "s2" }),                                         // neither: no labour
        visit("v4", { isReturn: true, arrivedAt: at("09:45") }),                    // return visit, 15 min
        visit("v5", { arrivedAt: at("01:00") }),                                    // 9 hours "on site": a forgotten Done, not labour
      ],
      time: [{ visitId: "v1", userId: "helper", minutes: 30 }, { visitId: null, userId: "silas", minutes: 60 }],
    });
    expect(p).toMatchObject({
      revenueCents: 9000, invoicedCents: 6000, unbilledCents: 3000, labourCents: 1500 + 2000 + 1000 + 500, expenseCents: 700, profitCents: 3300, marginPct: 37,
      visitsDone: 5, pushes: 4, returns: 1, storms: 2, perVisitCents: 1800, losing: false, labourFrom: { timers: 1, onSite: 2, none: 2 },
    });
  });
  it("flags a seasonal plan that costs more than it brings in", () => {
    const p = planProfit({ invoicedCents: 5000, hourlyCost, expenses: [], visits: [1, 2, 3, 4].map((n) => visit(`v${n}`, { arrivedAt: at("09:00") })), time: [] });
    expect(p).toMatchObject({ labourCents: 8000, profitCents: -3000, marginPct: -60, losing: true });
    expect(planProfit({ invoicedCents: 0, hourlyCost, expenses: [], visits: [], time: [] })).toMatchObject({ losing: false, perVisitCents: null, marginPct: null });
  });
});
