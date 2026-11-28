// Against a real database: depth tiers price a completed storm visit, a return visit bills once (or not at all),
// ice melt bags and time on site are recorded, and the season reports add it up.
import { describe, expect, it } from "vitest";
import { seasonFor } from "@/server/booking/create";
import { todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { createSnowPlan, renewPlan, updatePlan } from "@/server/ops/jobs";
import { cancelStorm } from "@/server/ops/storms";
import { usualByProperty, usualKey } from "@/server/ops/visit-times";
import { addReturnVisit, setIceMeltBags, transitionVisit } from "@/server/ops/visits";
import { REPORTS } from "@/server/reports";
import { runStops, visitScope } from "@/server/runner";
import { getSettings } from "@/server/settings";
import { returnVisitPrice } from "@/server/snow/tiers";

const tiers = [{ overCm: 10, addCents: 1500 }, { overCm: 20, addCents: 3000 }];

async function setup(tag: string, measuredCm: number | null) {
  const bid = await businessId();
  const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
  const today = todayLocal();
  const client = await db.client.create({ data: { businessId: bid, firstName: "Depth", lastName: tag, email: `depth-${tag}@example.com`, source: "MANUAL" } });
  const formatted = `${tag} Drift Rd SW, Calgary`;
  const property = await db.property.create({ data: { businessId: bid, clientId: client.id, formatted, normalized: formatted.toLowerCase() } });
  const season = await db.$transaction((tx) => seasonFor(tx, bid, today));
  const storm = await db.snowEvent.create({ data: { businessId: bid, seasonId: season.id, number: 800000 + Math.floor(Math.random() * 99999), name: `Depth storm ${tag}`, status: "ACTIVE", pushCount: 3, measuredCm } });
  const push = (jobId: string, n: number) => db.visit.create({ data: { businessId: bid, jobId, propertyId: property.id, snowEventId: storm.id, pushNumber: n, scheduledDate: toDbDate(today), source: "SNOW_EVENT" } });
  const charges = async (visitId: string) => (await db.visitCharge.findMany({ where: { visitId }, orderBy: { createdAt: "asc" } })).map((c) => [c.name, c.totalCents]);
  return { bid, owner, today, client, property, season, storm, push, charges };
}
const tag = (p: string) => `${p}${Date.now().toString(36)}`;

describe("depth tiers on a plan", () => {
  it("per push: the storm's depth picks the tier, the crew's own measurement wins, and tiers can be removed", async () => {
    const s = await setup(tag("t"), 15);
    const job = await createSnowPlan(s.owner, { clientId: s.client.id, propertyId: s.property.id, triggerCm: null, pricePerPushCents: 3000, iceMelt: false, depthTiers: tiers });
    expect(job.depthTiers).toEqual(tiers);
    const [p1, p2, p3] = [await s.push(job.id, 1), await s.push(job.id, 2), await s.push(job.id, 3)];
    await transitionVisit(s.owner, p1.id, "COMPLETED");
    expect(await s.charges(p1.id)).toEqual([["Snow clearing (per push), 11–20 cm", 4500]]);
    await transitionVisit(s.owner, p2.id, "COMPLETED", { depthCm: 25 });
    expect(await s.charges(p2.id)).toEqual([["Snow clearing (per push), over 20 cm", 6000]]);
    // Reopen and complete again: rebuilt, never doubled.
    await transitionVisit(s.owner, p2.id, "SCHEDULED");
    await transitionVisit(s.owner, p2.id, "COMPLETED", { depthCm: 4 });
    expect(await s.charges(p2.id)).toEqual([["Snow clearing (per push), up to 10 cm", 3000]]);
    // Tiers off: the plain price again for visits done from now on; what was charged stays.
    await updatePlan(s.owner, job.id, { depthTiers: [] });
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).depthTiers).toBeNull();
    await transitionVisit(s.owner, p3.id, "COMPLETED", { depthCm: 30 });
    expect(await s.charges(p3.id)).toEqual([["Snow clearing (per push)", 3000]]);
    expect(await s.charges(p1.id)).toEqual([["Snow clearing (per push), 11–20 cm", 4500]]);
  });

  it("per storm: charged once with its tier; nobody measured = the plain price; renewal keeps the tiers", async () => {
    const s = await setup(tag("e"), 22);
    const job = await createSnowPlan(s.owner, { clientId: s.client.id, propertyId: s.property.id, triggerCm: null, pricePerPushCents: 4000, iceMelt: false, depthTiers: tiers, billing: { mode: "PER_EVENT" } });
    const [p1, p2] = [await s.push(job.id, 1), await s.push(job.id, 2)];
    await transitionVisit(s.owner, p1.id, "COMPLETED");
    await transitionVisit(s.owner, p2.id, "COMPLETED");
    expect(await s.charges(p1.id)).toEqual([["Snow clearing (storm), over 20 cm", 7000]]);
    expect(await s.charges(p2.id)).toEqual([]); // the tiered name still counts as "this storm is charged"

    const none = await setup(tag("n"), null);
    const flat = await createSnowPlan(none.owner, { clientId: none.client.id, propertyId: none.property.id, triggerCm: null, pricePerPushCents: 3000, iceMelt: false, depthTiers: tiers });
    const v = await none.push(flat.id, 1);
    await transitionVisit(none.owner, v.id, "COMPLETED");
    expect(await none.charges(v.id)).toEqual([["Snow clearing (per push)", 3000]]);

    // renewPlan copies the client's latest plan: only meaningful when a later season exists to renew into.
    const next = await db.season.findFirst({ where: { businessId: s.bid, startsOn: { gt: toDbDate(s.today) } } });
    if (next) expect((await renewPlan(s.bid, s.client.id, { userId: s.owner.id })).depthTiers).toEqual(tiers);
  });
});

describe("return visits", () => {
  it("billable: on today's route as a return visit, bills its price exactly once, and crew see no price", async () => {
    const s = await setup(tag("r"), 12);
    const job = await createSnowPlan(s.owner, { clientId: s.client.id, propertyId: s.property.id, triggerCm: null, pricePerPushCents: 3000, iceMelt: true, depthTiers: tiers });
    const p1 = await s.push(job.id, 1);
    await expect(addReturnVisit(s.owner, p1.id, true)).rejects.toThrow(/completed storm visit/);
    await db.visitAssignee.create({ data: { visitId: p1.id, userId: s.owner.id } });
    await transitionVisit(s.owner, p1.id, "COMPLETED", { iceMeltApplied: true, iceMeltBags: 1.5 });
    expect(Number((await db.visit.findUniqueOrThrow({ where: { id: p1.id } })).iceMeltBags)).toBe(1.5);

    // A crew member who isn't on the stop can't add one.
    await expect(addReturnVisit(s.owner, p1.id, true, visitScope({ id: "someone-else", role: "CREW" }))).rejects.toThrow(/not found/);
    const ret = await addReturnVisit(s.owner, p1.id, true, visitScope({ id: s.owner.id, role: "CREW" }));
    const price = returnVisitPrice(3000, (await getSettings(db, s.bid)).returnVisitPct);
    expect(ret).toMatchObject({ isReturn: true, returnPriceCents: price || null, snowEventId: s.storm.id, pushNumber: null, jobId: job.id, propertyId: s.property.id, state: "SCHEDULED", routeSort: null });
    expect((await addReturnVisit(s.owner, p1.id, false)).id).toBe(ret.id); // a replay adds nothing while one is open
    expect(await db.visitAssignee.count({ where: { visitId: ret.id, userId: s.owner.id } })).toBe(1);

    const stop = (await runStops(s.bid, s.today, s.owner.id)).find((x) => x.visitId === ret.id)!;
    expect(stop).toMatchObject({ job: "Return visit", isReturn: true, storm: true, state: "SCHEDULED" });
    expect(JSON.stringify(stop)).not.toMatch(/cents|price/i);

    await transitionVisit(s.owner, ret.id, "COMPLETED");
    await transitionVisit(s.owner, ret.id, "SCHEDULED");
    await transitionVisit(s.owner, ret.id, "COMPLETED");
    expect(await s.charges(ret.id)).toEqual(price ? [["Return visit", price]] : []); // no clearing, no tier, no ice melt (none put down)
    expect(await s.charges(p1.id)).toEqual([["Snow clearing (per push), 11–20 cm", 4500], ["Ice melt", expect.any(Number)]]);

    // Bags can be fixed afterwards on a visit that had ice melt, and nowhere else.
    await setIceMeltBags(s.owner, p1.id, 2);
    await expect(setIceMeltBags(s.owner, ret.id, 1)).rejects.toThrow(/Ice melt/);

    // Reports: the plan with its visits, and the bags next to the ice melt charge.
    const profit = await REPORTS["plan-profit"].run(s.bid, { from: s.today, to: s.today, season: s.season.id });
    const row = profit.rows.find((r) => String(r[0]).startsWith(`#${job.number} `))!;
    const col = (name: string) => row[profit.columns.findIndex(([l]) => l === name)];
    expect([col("Visits done"), col("Pushes"), col("Return visits"), col("Invoiced")]).toEqual([2, 1, 1, 0]);
    expect(col("Not yet invoiced")).toBe(4500 + price + (await db.visitCharge.findFirstOrThrow({ where: { visitId: p1.id, name: "Ice melt" } })).totalCents);
    expect((await REPORTS["community-profit"].run(s.bid, { from: s.today, to: s.today, season: s.season.id })).rows.length).toBeGreaterThan(0);
    const mat = await REPORTS.materials.run(s.bid, { from: s.today, to: s.today });
    expect(mat.rows.find((r) => r[1] === s.storm.name)).toMatchObject({ 2: 1, 3: 2, 4: 0 });
  });

  it("included: no charge; an open one is cancelled with its storm", async () => {
    const s = await setup(tag("i"), 5);
    const job = await createSnowPlan(s.owner, { clientId: s.client.id, propertyId: s.property.id, triggerCm: null, pricePerPushCents: 3000, iceMelt: false });
    const p1 = await s.push(job.id, 1);
    await transitionVisit(s.owner, p1.id, "COMPLETED");
    const ret = await addReturnVisit(s.owner, p1.id, false);
    expect(ret.returnPriceCents).toBeNull();
    await transitionVisit(s.owner, ret.id, "COMPLETED");
    expect(await s.charges(ret.id)).toEqual([]);
    const again = await addReturnVisit(s.owner, p1.id, true); // the first is done, so this is a second trip
    expect(again.id).not.toBe(ret.id);
    await cancelStorm(s.owner, s.storm.id);
    expect((await db.visit.findUniqueOrThrow({ where: { id: again.id } })).state).toBe("CANCELLED");
  });
});

describe("time on site", () => {
  it("a property's usual minutes come from its last timed visits", async () => {
    const s = await setup(tag("u"), 5);
    const job = await createSnowPlan(s.owner, { clientId: s.client.id, propertyId: s.property.id, triggerCm: null, pricePerPushCents: 3000, iceMelt: false });
    const key = usualKey(s.property.id, true);
    for (const [n, min] of [[1, 10], [2, 14]] as const) {
      const v = await s.push(job.id, n);
      await transitionVisit(s.owner, v.id, "IN_PROGRESS");
      await transitionVisit(s.owner, v.id, "COMPLETED");
      await db.visit.update({ where: { id: v.id }, data: { arrivedAt: new Date(Date.now() - min * 60_000), completedAt: new Date() } });
    }
    expect((await usualByProperty(s.bid, [s.property.id])).has(key)).toBe(false); // two isn't "usually"
    // The third was only timed with a timer, not Arrived/Done.
    const v3 = await s.push(job.id, 3);
    await transitionVisit(s.owner, v3.id, "COMPLETED");
    await db.timeEntry.create({ data: { businessId: s.bid, userId: s.owner.id, visitId: v3.id, jobId: job.id, startedAt: new Date(Date.now() - 18 * 60_000), endedAt: new Date(), minutes: 18 } });
    expect((await usualByProperty(s.bid, [s.property.id])).get(key)).toBe(14);
    expect((await runStops(s.bid, s.today, "all")).find((x) => x.visitId === v3.id)?.usualMin).toBe(14);
  });
});
