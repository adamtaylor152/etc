// Route runner API. GET: my stops for a day (cached on the phone for offline). POST: a visit action, safe to replay
// (the phone queues actions while offline and resends them; repeating one that already happened is a no-op).
import { z } from "zod";
import type { SkipReason, VisitState } from "@/generated/prisma/client";
import { currentUser } from "@/server/auth";
import { todayLocal } from "@/server/dates";
import { db } from "@/server/db";
import { transitionVisit } from "@/server/ops/visits";
import { runStops, visitScope } from "@/server/runner";
import { TransitionError } from "@/server/status/visit";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const u = new URL(req.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("date") ?? "") ? u.searchParams.get("date")! : todayLocal();
  const who = u.searchParams.get("who") === "all" && user.role === "OWNER" ? "all" : user.id;
  return Response.json({ date, stops: await runStops(user.businessId, date, who), at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

const Action = z.object({
  visitId: z.string().min(1), to: z.enum(["EN_ROUTE", "IN_PROGRESS", "COMPLETED", "SKIPPED"]),
  depthCm: z.number().int().min(0).max(200).nullish(), iceMeltApplied: z.boolean().nullish(),
  skipReason: z.enum(["ALREADY_CLEARED", "BLOCKED_BY_CAR", "NO_ACCESS", "BELOW_TRIGGER", "CLIENT_CANCELLED", "WEATHER", "OTHER"]).nullish(),
  lat: z.number().nullish(), lng: z.number().nullish(),
});
const ORDER: VisitState[] = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const a = Action.safeParse(await req.json().catch(() => null));
  if (!a.success) return Response.json({ error: "Bad action" }, { status: 400 });
  const v = await db.visit.findFirst({ where: { id: a.data.visitId, businessId: user.businessId, ...visitScope(user) } });
  if (!v) return Response.json({ error: "Visit not found" }, { status: 404 });
  // Replays and out-of-order sends: already there (or past it) means nothing to do.
  if (v.state === a.data.to || v.state === "SKIPPED" || v.state === "CANCELLED" || (ORDER.indexOf(v.state) >= ORDER.indexOf(a.data.to) && a.data.to !== "SKIPPED")) {
    return Response.json({ ok: true, state: v.state, noop: true });
  }
  try {
    await transitionVisit(user, v.id, a.data.to, {
      depthCm: a.data.depthCm ?? undefined, iceMeltApplied: a.data.iceMeltApplied ?? undefined,
      skipReason: (a.data.skipReason ?? undefined) as SkipReason | undefined, lat: a.data.lat ?? null, lng: a.data.lng ?? null,
    });
  } catch (e) {
    if (e instanceof TransitionError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
  return Response.json({ ok: true, state: a.data.to });
}
