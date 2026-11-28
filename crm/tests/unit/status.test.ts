import { describe, expect, it } from "vitest";
import { computeJobStatus, jobEditLocks, visitStatus, type JobEditFacts, type JobLike, type VisitLike } from "@/server/status/job";

const T = "2026-12-04";
const job = (p: Partial<JobLike> = {}): JobLike => ({
  kind: "ONE_OFF", closedAt: null, planPausedAt: null, asNeeded: false, billingType: "PER_VISIT", hasInvoice: false, unbilledCharges: 0, ...p,
});
const v = (state: VisitLike["state"], scheduledDate: string | null = null): VisitLike => ({ state, scheduledDate });

describe("visitStatus", () => {
  it.each([
    [v("SCHEDULED", null), "UNSCHEDULED"],
    [v("SCHEDULED", "2026-12-03"), "LATE"],
    [v("SCHEDULED", T), "TODAY"],
    [v("SCHEDULED", "2026-12-05"), "UPCOMING"],
    [v("EN_ROUTE", "2026-12-03"), "EN_ROUTE"],
    [v("COMPLETED", "2026-12-01"), "COMPLETED"],
    [v("SKIPPED", "2026-12-01"), "SKIPPED"],
  ])("%j -> %s", (visit, want) => expect(visitStatus(visit, T)).toBe(want));
});

describe("computeJobStatus", () => {
  it.each<[string, JobLike, VisitLike[], string]>([
    ["closed wins", job({ closedAt: new Date() }), [v("SCHEDULED", "2026-12-01")], "ARCHIVED"],
    ["late beats today", job(), [v("SCHEDULED", "2026-12-01"), v("SCHEDULED", T)], "LATE"],
    ["today", job(), [v("SCHEDULED", T)], "TODAY"],
    ["on the way counts as today", job(), [v("EN_ROUTE", "2026-12-05")], "TODAY"],
    ["unbilled charges", job({ unbilledCharges: 1 }), [v("COMPLETED", "2026-12-01"), v("SCHEDULED", "2026-12-09")], "REQUIRES_INVOICING"],
    ["fixed price done, no invoice", job({ billingType: "FIXED_PRICE" }), [v("COMPLETED", "2026-12-01")], "REQUIRES_INVOICING"],
    ["fixed price done, invoiced", job({ billingType: "FIXED_PRICE", hasInvoice: true }), [v("COMPLETED", "2026-12-01")], "ACTION_REQUIRED"],
    ["recurring fixed price per month is invoiced by the monthly run, not when its visits are done", job({ kind: "RECURRING", billingType: "FIXED_PRICE" }), [v("COMPLETED", "2026-12-01")], "ACTION_REQUIRED"],
    ["upcoming", job(), [v("SCHEDULED", "2026-12-09")], "UPCOMING"],
    ["snow plan waiting", job({ kind: "SNOW_PLAN" }), [v("COMPLETED", "2026-11-20")], "ON_PLAN"],
    ["snow plan paused", job({ kind: "SNOW_PLAN", planPausedAt: new Date() }), [], "PAUSED"],
    ["snow plan with a storm visit today", job({ kind: "SNOW_PLAN" }), [v("SCHEDULED", T)], "TODAY"],
    ["unscheduled visit", job(), [v("SCHEDULED", null)], "UNSCHEDULED"],
    ["no visits at all", job(), [], "UNSCHEDULED"],
    ["as-needed with nothing pending", job({ asNeeded: true, kind: "RECURRING" }), [], "ACTION_REQUIRED"],
    ["all done, nothing to bill", job(), [v("COMPLETED", "2026-12-01")], "ACTION_REQUIRED"],
  ])("%s", (_, j, visits, want) => expect(computeJobStatus(j, visits, T)).toBe(want));
});

describe("jobEditLocks", () => {
  const facts = (p: Partial<JobEditFacts> = {}): JobEditFacts => ({ kind: "ONE_OFF", closedAt: null, sizeHoldAt: null, billingType: "PER_VISIT", invoiced: false, hasCharges: false, ...p });
  const locked = (p: Partial<JobEditFacts>) => Object.entries(jobEditLocks(facts(p))).filter(([, why]) => why).map(([k]) => k);
  it.each<[string, Partial<JobEditFacts>, string[]]>([
    ["fresh one-off: everything editable", {}, []],
    ["per-visit with done visits: prices still editable (charges are copies), billing type is not", { hasCharges: true }, ["billing"]],
    ["per-visit already invoiced: same", { hasCharges: true, invoiced: true }, ["billing"]],
    ["fixed price, not invoiced", { billingType: "FIXED_PRICE" }, []],
    ["fixed price invoiced: the money is locked", { billingType: "FIXED_PRICE", invoiced: true }, ["lines", "billing"]],
    ["recurring: lines yes, billing never", { kind: "RECURRING" }, ["billing"]],
    ["recurring fixed price per month, months already invoiced: the price can still change for the months to come", { kind: "RECURRING", billingType: "FIXED_PRICE", invoiced: true }, ["billing"]],
    ["snow plan: only title and instructions", { kind: "SNOW_PLAN" }, ["lines", "billing", "property"]],
    ["closed job", { closedAt: new Date() }, ["lines", "billing", "property"]],
    ["driveway price waiting on the client", { sizeHoldAt: new Date() }, ["lines", "billing"]],
  ])("%s", (_, p, want) => expect(locked(p)).toEqual(want));
});
