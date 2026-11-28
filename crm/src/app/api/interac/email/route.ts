// Raw emails from the Cloudflare Email Worker for pay@etccrew.ca (and the bounce mailbox, see README).
// The Worker must send the shared secret. Then: an Interac notice counts only with a valid DKIM signature from
// interac.ca AND a signed To header naming our e-Transfer address (anyone can forward us a real notice that was
// sent to them); a bounce report counts only if it quotes the id of an email we sent. Anything else is dropped quietly.
import { handleBounce } from "@/server/email/bounce";
import { addressedToUs, autoDeposited, etransferAddresses, handleInteracNotice, inboundAuthorized, interacRecipients, parseRawEmail } from "@/server/billing/interac-email";

const MAX = 2 * 1024 * 1024;

export async function POST(req: Request) {
  if (!inboundAuthorized(req)) return new Response("Not found", { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX) return Response.json({ error: "bad size" }, { status: 413 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (!raw.length || raw.length > MAX) return Response.json({ error: "bad size" }, { status: 413 });
  const to = await interacRecipients(raw);
  if (!to) {
    const b = await handleBounce(raw.toString("utf8"));
    return Response.json(b.bounce ? { ok: true, ...b } : { ok: true, ignored: "not a signed Interac email" });
  }
  if (!addressedToUs(to, await etransferAddresses())) {
    console.warn("Interac notice ignored: not addressed to the e-Transfer address", to);
    return Response.json({ ok: true, ignored: "not addressed to the e-Transfer address" });
  }
  const mail = await parseRawEmail(raw);
  const result = await handleInteracNotice(mail.subject, mail.text, autoDeposited(mail.text));
  return Response.json({ ok: true, ...result });
}
