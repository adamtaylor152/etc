// Telnyx messaging webhook: inbound texts and delivery receipts. Verified with Telnyx's ed25519 signature.
import { businessId } from "@/server/db";
import { receiveText, textStatus } from "@/server/ops/texts";
import { parseTelnyxEvent, verifyTelnyx } from "@/server/sms";

export async function POST(req: Request) {
  const key = process.env.TELNYX_PUBLIC_KEY;
  if (!key) return new Response("webhook not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519"), req.headers.get("telnyx-timestamp"), key)) {
    return new Response("bad signature", { status: 401 });
  }
  const event = parseTelnyxEvent(JSON.parse(raw));
  if (event.kind === "received") await receiveText(await businessId(), event);
  if (event.kind === "status") await textStatus(event);
  return Response.json({ ok: true });
}
