// Small helpers for public route handlers.
import { db } from "./db";

/** Real client IP: Cloudflare sets CF-Connecting-IP; otherwise the LAST X-Forwarded-For hop (earlier hops are client-supplied). */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim()
    ?? "unknown";
}

/**
 * True once `key` has had more than `limit` hits in its current window. Counted in Postgres (one atomic upsert), so the
 * limit survives deploys and holds across containers. A fixed window: it opens on the first hit and the count starts
 * over once `windowMs` has passed. Every call counts, refused ones too.
 */
export async function limited(key: string, limit = 5, windowMs = 600_000, now = Date.now()): Promise<boolean> {
  const at = new Date(now), stale = new Date(now - windowMs);
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key.slice(0, 300)}, ${at}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= ${stale} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${stale} THEN ${at} ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return count > limit;
}

/** Hourly sweep: windows are an hour at most, so anything a day old is long finished. */
export const sweepRateLimits = (now = Date.now()) => db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 86_400_000) } } });

export const PUBLIC_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
