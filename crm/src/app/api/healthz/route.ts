// Health. Plain: for the outside monitor (.github/workflows/monitor.yml): 503 = down (database or scheduler); email/text
// trouble shows as ok:false with 200. ?live=1: database only, for the container HEALTHCHECK, so a stalled scheduler
// never makes the proxy stop sending traffic to an otherwise working site. Booleans and counts only.
import { db } from "@/server/db";
import { health } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has("live")) {
    try { await db.$queryRaw`SELECT 1`; return Response.json({ ok: true }); } catch { return Response.json({ ok: false }, { status: 503 }); }
  }
  const h = await health();
  return Response.json({ ok: h.up && h.checks.emails && h.checks.texts, ...h }, { status: h.up ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
