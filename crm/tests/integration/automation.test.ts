// The hourly tick wraps each automation: one throwing must not stop the next, and health must show it.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { health } from "@/server/health";
import { automation } from "@/server/scheduler";

const bad = `test-${process.pid}-bad`, good = `test-${process.pid}-good`;
afterAll(async () => { await db.automationRun.deleteMany({ where: { name: { in: [bad, good] } } }); });

describe("hourly automations", () => {
  it("a failing automation is recorded, doesn't throw, and the next one still runs", async () => {
    let ran = false;
    await automation(bad, async () => { throw new Error("boom"); });
    await automation(good, async () => { ran = true; });
    expect(ran).toBe(true);
    expect(await db.automationRun.findUniqueOrThrow({ where: { name: bad } })).toMatchObject({ lastOkAt: null, lastError: "boom" });
    const h = await health();
    expect(h.automations[bad]).toEqual({ lastGoodMinutesAgo: null, failing: true });
    expect(h.automations[good]).toEqual({ lastGoodMinutesAgo: 0, failing: false });
    expect(h.checks.automations).toBe(false);
    expect(h.up).toBe(true); // flagged, not "down"
  });

  it("clears once it works again", async () => {
    await automation(bad, async () => {});
    expect((await health()).automations[bad]).toEqual({ lastGoodMinutesAgo: 0, failing: false });
  });
});
