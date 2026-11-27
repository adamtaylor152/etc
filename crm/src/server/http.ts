// Small helpers for public route handlers.

/** Real client IP: Cloudflare sets CF-Connecting-IP; otherwise the LAST X-Forwarded-For hop (earlier hops are client-supplied). */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim()
    ?? "unknown";
}

// ponytail: in-memory, per process, resets on restart. Fine for one container; move to Postgres if this scales out.
const hits = new Map<string, number[]>();
export function limited(key: string, limit = 5, windowMs = 600_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, [...recent, now]);
  return recent.length >= limit;
}

export const PUBLIC_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
