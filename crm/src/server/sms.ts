// Text messages via Telnyx (the business number 403-656-8200 lives there). REST, no SDK.
// Off until TELNYX_API_KEY and TELNYX_FROM are set. Inbound texts arrive at /api/telnyx/webhook,
// signed with Telnyx's ed25519 key (TELNYX_PUBLIC_KEY, from the Telnyx portal).
import { createPublicKey, verify } from "node:crypto";

/** "403-656-8200", "(403) 656 8200", "+1 403..." -> "+14036568200". null if it isn't a North American number. */
export function toE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const smsEnabled = () => !!(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM);
export const smsFrom = () => toE164(process.env.TELNYX_FROM) ?? "";

/** Keep texts short; carriers split long ones (and bill per segment). */
export const clip = (s: string, max = 300) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

/** Sends an SMS, or an MMS when mediaUrls is given (public URLs Telnyx fetches; we hand it signed links). */
export async function sendSms(to: string, body: string, mediaUrls: string[] = []): Promise<string> {
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: smsFrom(), to, text: body, ...(mediaUrls.length ? { media_urls: mediaUrls } : {}), ...(process.env.TELNYX_MESSAGING_PROFILE_ID ? { messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }; errors?: { detail?: string; title?: string }[] };
  if (!res.ok) throw new Error(`Telnyx ${res.status}: ${data.errors?.[0]?.detail ?? data.errors?.[0]?.title ?? "send failed"}`);
  return data.data?.id ?? "";
}

// ---------- inbound webhook ----------
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Telnyx signs `${timestamp}|${rawBody}` with ed25519. Rejects stale timestamps (replays). Pure, unit-tested. */
export function verifyTelnyx(rawBody: string, signatureB64: string | null, timestamp: string | null, publicKeyB64: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!signatureB64 || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;
  try {
    const raw = Buffer.from(publicKeyB64, "base64");
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export type TelnyxEvent =
  | { kind: "received"; id: string; from: string; to: string; text: string; type: string; media: { url: string; contentType: string }[] }
  | { kind: "status"; id: string; status: string; error: string | null }
  | { kind: "other" };

/** Pull what we need out of a Telnyx messaging webhook. Pure, unit-tested. */
export function parseTelnyxEvent(body: unknown): TelnyxEvent {
  const d = (body as { data?: { event_type?: string; payload?: Record<string, unknown> } })?.data;
  const p = d?.payload as {
    id?: string; text?: string; type?: string; media?: { url?: string; content_type?: string }[]; from?: { phone_number?: string }; to?: { phone_number?: string; status?: string }[];
    errors?: { detail?: string; title?: string }[];
  } | undefined;
  if (!d || !p?.id) return { kind: "other" };
  if (d.event_type === "message.received") {
    return { kind: "received", id: p.id, from: toE164(p.from?.phone_number) ?? p.from?.phone_number ?? "", to: toE164(p.to?.[0]?.phone_number) ?? "", text: p.text ?? "",
      type: (p.type ?? "SMS").toUpperCase(),
      media: (p.media ?? []).filter((m) => m.url?.startsWith("https://")).map((m) => ({ url: m.url!, contentType: m.content_type ?? "application/octet-stream" })) };
  }
  if (d.event_type === "message.sent" || d.event_type === "message.finalized") {
    return { kind: "status", id: p.id, status: p.to?.[0]?.status ?? "sent", error: p.errors?.[0]?.detail ?? p.errors?.[0]?.title ?? null };
  }
  return { kind: "other" };
}

/** Carrier-standard keywords. Telnyx also blocks texts to opted-out numbers; we mirror it so the UI knows. */
export const keyword = (text: string): "STOP" | "START" | null => {
  const w = text.trim().toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET"].includes(w)) return "STOP";
  if (["START", "UNSTOP", "YES", "SUBSCRIBE"].includes(w)) return "START";
  return null;
};
