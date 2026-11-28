// End to end against a real database (CI's seeded Postgres, or the local dev one): the path money and storm days
// depend on. Book a one-time shovel, find it's a large driveway, client OKs the new price, it shows on the route,
// the crew finishes it. Nothing is sent: the outbox doesn't run under vitest.
import { describe, expect, it } from "vitest";
import { createBooking } from "@/server/booking/create";
import { publicTimes } from "@/server/booking/slots";
import { validate } from "@/server/booking/validate";
import { todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { health } from "@/server/health";
import { answerPrice, confirmSize, currentCharge, snowPrices } from "@/server/ops/drive-size";
import { transitionVisit } from "@/server/ops/visits";
import { runStops } from "@/server/runner";

describe("booking → size check → route → done", () => {
  it("works end to end", async () => {
    const bid = await businessId();
    const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
    const today = todayLocal();
    const tag = Date.now().toString(36);

    const booking = validate({
      name: "Flow Test", email: `flow-${tag}@example.com`, address: `${tag} Evergreen Way SW, Calgary`, lat: 50.914, lng: -114.112,
      payment: "Cash", plan: "One-time visit", services: ["Snow shovelling"], size: "Standard",
    }, today);
    expect(booking.estimate).toBe("$35");
    const res = await createBooking(booking, { businessId: bid, source: "BOOKING_FORM", sendEmails: false });
    const job = await db.job.findUniqueOrThrow({ where: { id: res.jobId! }, include: { visits: true, lineItems: true } });
    const prices = await snowPrices(db, bid);
    expect(currentCharge(job.lineItems).base).toBe(prices.once.STANDARD);
    const visit = job.visits[0];
    await db.visit.update({ where: { id: visit.id }, data: { scheduledDate: toDbDate(today) } });
    const onRoute = async () => (await runStops(bid, today, "all")).some((s) => s.visitId === visit.id);
    expect(await onRoute()).toBe(true);

    // Owner checks the satellite view: it's large. Job is held off the route until the client answers.
    expect(await confirmSize(owner, job.propertyId, "LARGE", false)).toEqual(["asked"]);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).sizeHoldAt).not.toBeNull();
    expect(await onRoute()).toBe(false);
    expect(await db.emailMessage.count({ where: { template: "price.change", entityId: job.id } })).toBe(1);

    await answerPrice(job.id, true);
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id }, include: { lineItems: true } });
    expect(after.sizeHoldAt).toBeNull();
    expect(currentCharge(after.lineItems).base).toBe(prices.once.LARGE);
    const stop = (await runStops(bid, today, "all")).find((s) => s.visitId === visit.id);
    expect(stop?.sizeNote).toBeNull(); // checked now: no crew warning

    await transitionVisit(owner, visit.id, "IN_PROGRESS", {});
    await transitionVisit(owner, visit.id, "COMPLETED", { depthCm: 8, iceMeltApplied: false });
    expect((await db.visit.findUniqueOrThrow({ where: { id: visit.id } })).state).toBe("COMPLETED");
  }, 30_000); // real database, several transactions: slow when the machine is busy

  it("public booking times and health don't crash", async () => {
    expect(Array.isArray(await publicTimes(await businessId()))).toBe(true);
    expect((await health()).checks.db).toBe(true);
  }, 30_000);
});
