// Raw Interac notice emails from the Cloudflare Email Worker for pay@etccrew.ca.
// No secret: the email must carry a valid DKIM signature from interac.ca. The one other thing it accepts is a bounce
// report that quotes the id of an email we sent (see handleBounce). Anything else is dropped quietly.
import { handleBounce } from "@/server/email/bounce";
import { autoDeposited, handleInteracNotice, parseRawEmail, signedByInterac } from "@/server/billing/interac-email";

const MAX = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (!raw.length || raw.length > MAX) return Response.json({ error: "bad size" }, { status: 413 });
  if (!(await signedByInterac(raw))) {
    const b = await handleBounce(raw.toString("utf8"));
    return Response.json(b.bounce ? { ok: true, ...b } : { ok: true, ignored: "not a signed Interac email" });
  }
  const mail = await parseRawEmail(raw);
  const result = await handleInteracNotice(mail.subject, mail.text, autoDeposited(mail.text));
  return Response.json({ ok: true, ...result });
}
