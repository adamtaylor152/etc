// Against a real database: a seasonal snow plan is billed by instalment invoices (never twice, none after the plan
// ends) and its visits add no clearing charge; a per-storm plan charges once per storm whichever push is done.
import { describe, expect, it } from "vitest";
import { seasonFor } from "@/server/booking/create";
import { todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { invoiceSeasonalInstalments } from "@/server/ops/invoices";
import { createSnowPlan, setJobClosed, updatePlan } from "@/server/ops/jobs";
import { addVisit, transitionVisit } from "@/server/ops/visits";

async function clientWithProperty(bid: string, tag: string) {
  const client = await db.client.create({ data: { businessId: bid, firstName: "Season", lastName: tag, email: `season-${tag}@example.com`, source: "MANUAL" } });
  const formatted = `${tag} Snowpack Rd SW, Calgary`;
  const property = await db.property.create({ data: { businessId: bid, clientId: client.id, formatted, normalized: formatted.toLowerCase() } });
  return { clientId: client.id, propertyId: property.id };
}

describe("snow plan billing modes", () => {
  it("seasonal: instalment invoices, idempotent, stop when the plan ends", async () => {
    const bid = await businessId();
    const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
    const today = todayLocal();
    const ids = await clientWithProperty(bid, `s${Date.now().toString(36)}`);
    const job = await createSnowPlan(owner, { ...ids, triggerCm: null, pricePerPushCents: 3000, iceMelt: true, billing: { mode: "SEASONAL", seasonalPriceCents: 50000, instalments: 1, firstDueOn: today, addonsIncluded: true } });
    expect(job).toMatchObject({ snowBillingMode: "SEASONAL", seasonalPriceCents: 50000, seasonalInstalments: 1, addonsIncluded: true });
    await expect(createSnowPlan(owner, { ...(await clientWithProperty(bid, `x${Date.now().toString(36)}`)), triggerCm: null, pricePerPushCents: 3000, iceMelt: false, billing: { mode: "SEASONAL", seasonalPriceCents: null } })).rejects.toThrow(/season price/);

    // Three monthly instalments whose due dates have all passed (first two months ago, then the 1st of each month).
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 3, 1));
    await db.job.update({ where: { id: job.id }, data: { seasonalInstalments: 3, seasonalFirstDueOn: first } });

    // Ended plan: nothing is invoiced. Reopened: everything due is, once.
    await setJobClosed(owner, job.id, true);
    expect(await invoiceSeasonalInstalments({ id: job.id })).toBe(0);
    await setJobClosed(owner, job.id, false);
    expect(await invoiceSeasonalInstalments({ id: job.id })).toBe(3);
    expect(await invoiceSeasonalInstalments({ id: job.id })).toBe(0);
    const invoices = await db.invoice.findMany({ where: { jobId: job.id }, orderBy: { number: "asc" }, include: { lineItems: true } });
    expect(invoices.map((i) => i.totalCents)).toEqual([16667, 16667, 16666]);
    expect(invoices.map((i) => i.instalmentKey)).toEqual([1, 2, 3].map((n) => `${job.id}:${n}`));
    for (const i of invoices) {
      expect(i).toMatchObject({ status: "AWAITING_PAYMENT", etransferRef: `ETC-${i.number}`, taxCents: 0, clientId: ids.clientId });
      expect(i.lineItems).toHaveLength(1);
      expect(await db.emailMessage.count({ where: { template: "invoice.sent", entityId: i.id } })).toBe(1);
    }

    // Locked now: the season price can't change, but trigger / ice melt still can.
    await expect(updatePlan(owner, job.id, { triggerCm: null, pricePerPushCents: 3000, iceMelt: true, billing: { mode: "SEASONAL", seasonalPriceCents: 60000, instalments: 3 } })).rejects.toThrow(/can't change/);
    await expect(updatePlan(owner, job.id, { triggerCm: null, pricePerPushCents: 3000, iceMelt: true, billing: { mode: "PER_PUSH" } })).rejects.toThrow(/can't change/);
    await updatePlan(owner, job.id, { triggerCm: 5, pricePerPushCents: 3000, iceMelt: true });

    // A visit on a seasonal plan (ice melt included) adds no charge.
    const visit = await addVisit(owner, job.id, today);
    await transitionVisit(owner, visit.id, "COMPLETED", { iceMeltApplied: true });
    expect(await db.visitCharge.count({ where: { visitId: visit.id } })).toBe(0);
  });

  it("per storm: one clearing charge per storm even when push 1 was skipped", async () => {
    const bid = await businessId();
    const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
    const today = todayLocal();
    const ids = await clientWithProperty(bid, `e${Date.now().toString(36)}`);
    const job = await createSnowPlan(owner, { ...ids, triggerCm: null, pricePerPushCents: 4000, iceMelt: false, billing: { mode: "PER_EVENT" } });
    // Unlocked: the mode can still change (and change back).
    await updatePlan(owner, job.id, { triggerCm: null, pricePerPushCents: 4000, iceMelt: false, billing: { mode: "PER_PUSH" } });
    await updatePlan(owner, job.id, { triggerCm: null, pricePerPushCents: 4000, iceMelt: false, billing: { mode: "PER_EVENT" } });
    const season = await db.$transaction((tx) => seasonFor(tx, bid, today));
    const storm = await db.snowEvent.create({ data: { businessId: bid, seasonId: season.id, number: 900000 + Math.floor(Math.random() * 99999), name: "Test storm", status: "ACTIVE", pushCount: 3 } });
    const push = (n: number) => db.visit.create({ data: { businessId: bid, jobId: job.id, propertyId: ids.propertyId, snowEventId: storm.id, pushNumber: n, scheduledDate: toDbDate(today), source: "SNOW_EVENT" } });
    const [p1, p2, p3] = [await push(1), await push(2), await push(3)];
    await transitionVisit(owner, p1.id, "SKIPPED", { skipReason: "BLOCKED_BY_CAR" });
    await transitionVisit(owner, p2.id, "COMPLETED");
    await transitionVisit(owner, p3.id, "COMPLETED");
    const charges = await db.visitCharge.findMany({ where: { visit: { jobId: job.id } } });
    expect(charges.map((c) => [c.visitId, c.name, c.totalCents])).toEqual([[p2.id, "Snow clearing (storm)", 4000]]);
  });
});
