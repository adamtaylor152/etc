// Inbound Interac e-Transfer notices as JSON (already-parsed text; the Worker in the README posts raw email to
// /api/interac/email instead). Auth: shared secret header. Matched -> e-Transfer payment recorded (receipt emailed).
// Unmatched -> owners told.
import { autoDeposited, handleInteracNotice, inboundAuthorized } from "@/server/billing/interac-email";

export async function POST(req: Request) {
  if (!inboundAuthorized(req)) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null) as { from?: string; subject?: string; text?: string } | null;
  if (!body?.text) return Response.json({ error: "text required" }, { status: 400 });
  if (body.from && !/interac\.ca$/i.test(body.from.replace(/[>\s]/g, ""))) return Response.json({ ok: true, ignored: "not from Interac" });

  const text = body.text;
  return Response.json({ ok: true, ...(await handleInteracNotice(body.subject ?? "", text, autoDeposited(text))) });
}
