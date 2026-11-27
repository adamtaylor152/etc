// Text messages via Twilio's REST API (no SDK). Off until TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set.
// Texts go through the same outbox as email (template names starting "sms."), so they retry and dedupe the same way.
// Only clients who opted in (Client.smsOptIn) get texts; Twilio handles STOP replies for the number.

/** "403-656-8200", "(403) 656 8200", "+1 403..." -> "+14036568200". null if it isn't a North American number. */
export function toE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const smsEnabled = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

/** One SMS segment-ish: keep texts short; Twilio splits longer ones (and bills per segment). */
export const clip = (s: string, max = 300) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? "send failed"}`);
  return data.sid ?? "";
}
