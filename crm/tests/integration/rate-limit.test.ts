// The rate limiter counts in Postgres (it guards public booking, login links, hub orders and reschedules), so it's
// tested against the real table: the window, concurrent hits, and the hourly sweep.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { limited, sweepRateLimits } from "@/server/http";

const key = (n: string) => `test:${process.pid}:${n}`;
afterAll(async () => { await db.rateLimit.deleteMany({ where: { key: { startsWith: `test:${process.pid}:` } } }); });

describe("rate limit", () => {
  it("allows 5 per window, blocks the rest, and starts over when the window ends", async () => {
    const t0 = Date.now();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await limited(key("a"), 5, 600_000, t0 + i));
    expect(results).toEqual([false, false, false, false, false, true, true]);
    expect(await limited(key("a"), 5, 600_000, t0 + 599_999)).toBe(true); // still the same window
    expect(await limited(key("a"), 5, 600_000, t0 + 600_001)).toBe(false); // a new one
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: key("a") } })).count).toBe(1);
  });

  it("keeps keys apart", async () => {
    expect(await limited(key("b"), 1)).toBe(false);
    expect(await limited(key("b"), 1)).toBe(true);
    expect(await limited(key("c"), 1)).toBe(false);
  });

  it("counts every one of 20 hits that land at once", async () => {
    const hits = await Promise.all(Array.from({ length: 20 }, () => limited(key("d"), 5)));
    expect(hits.filter((h) => !h)).toHaveLength(5);
    expect((await db.rateLimit.findUniqueOrThrow({ where: { key: key("d") } })).count).toBe(20);
  });

  it("the sweep removes finished windows and leaves live ones", async () => {
    const now = Date.now();
    await limited(key("old"), 5, 600_000, now - 2 * 86_400_000);
    await limited(key("live"), 5, 600_000, now);
    await sweepRateLimits(now);
    expect(await db.rateLimit.findUnique({ where: { key: key("old") } })).toBeNull();
    expect(await db.rateLimit.findUnique({ where: { key: key("live") } })).not.toBeNull();
  });
});
