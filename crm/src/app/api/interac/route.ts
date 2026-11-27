// Inbound Interac e-Transfer notices (forwarded by a Cloudflare Email Worker, see README).
// Auth: shared secret header. Matched -> e-Transfer payment recorded (receipt emailed). Unmatched -> owners told.
import { timingSafeEqual } from "node:crypto";
import { autoDeposited, handleInteracNotice } from "@/server/billing/interac-email";

function authorized(req: Request) {
  const want = process.env.INTERAC_INBOUND_SECRET ?? "";
  const got = req.headers.get("x-etc-secret") ?? "";
  return want.length >= 16 && want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null) as { from?: string; subject?: string; text?: string } | null;
  if (!body?.text) return Response.json({ error: "text required" }, { status: 400 });
  if (body.from && !/interac\.ca$/i.test(body.from.replace(/[>\s]/g, ""))) return Response.json({ ok: true, ignored: "not from Interac" });

  const text = body.text;
  return Response.json({ ok: true, ...(await handleInteracNotice(body.subject ?? "", text, autoDeposited(text))) });
}
