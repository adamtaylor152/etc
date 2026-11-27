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

// ---------- RCS (branded chat with read receipts and tap-to-reply buttons) ----------
// Off until TELNYX_RCS_AGENT_ID is set (the agent has to be approved first). Phones without RCS get the same text by SMS/MMS.
export const rcsEnabled = () => smsEnabled() && !!process.env.TELNYX_RCS_AGENT_ID;
const telnyx = (path: string, init?: RequestInit) => fetch(`https://api.telnyx.com/v2${path}`, {
  ...init, headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
});

// ponytail: in-memory cache (the lookup is slow); per process, gone on restart, which is fine.
const capCache = new Map<string, { features: string[]; at: number }>();
const CAP_TTL = 24 * 3_600_000;

/** RCS features a phone supports ([] = not RCS, send SMS). Never throws: any failure means "use SMS". */
export async function rcsFeatures(to: string): Promise<string[]> {
  if (!rcsEnabled()) return [];
  const hit = capCache.get(to);
  if (hit && Date.now() - hit.at < CAP_TTL) return hit.features;
  try {
    const res = await telnyx(`/messaging/rcs/capabilities/${encodeURIComponent(process.env.TELNYX_RCS_AGENT_ID!)}/${encodeURIComponent(to)}`);
    const data = (await res.json().catch(() => ({}))) as { data?: { features?: string[] | null } };
    const features = res.ok ? (data.data?.features ?? []) : [];
    capCache.set(to, { features, at: Date.now() });
    return features;
  } catch {
    return [];
  }
}

/** Fallback text for phones without RCS: the reply buttons become a "Reply:" line. Pure, unit-tested. */
export const withReplyHint = (text: string, replies: string[]) => (replies.length ? `${text}${text ? "\n\n" : ""}Reply: ${replies.join(" / ")}` : text);

/**
 * The RCS request body. Photos become a card (one) or carousel (2-10); reply buttons become suggestions.
 * Telnyx sends the sms/mms fallback itself when the phone can't take RCS. Pure, unit-tested.
 */
export function rcsBody(o: { agentId: string; profileId?: string; from: string; to: string; text: string; mediaUrls?: string[]; replies?: string[] }) {
  const media = o.mediaUrls ?? [];
  const suggestions = (o.replies ?? []).slice(0, 11).map((r, i) => ({ reply: { text: r.slice(0, 25), postback_data: `reply:${i}` } }));
  const card = (url: string, withText: boolean) => ({
    ...(withText && o.text ? { description: o.text.slice(0, 2000) } : {}),
    media: { height: "MEDIUM", content_info: { file_url: url, content_type: "image/jpeg" } },
  });
  const content_message = !media.length ? { text: o.text, ...(suggestions.length ? { suggestions } : {}) }
    : media.length === 1 ? { rich_card: { standalone_card: { card_orientation: "VERTICAL", card_content: { ...card(media[0], true), ...(suggestions.length ? { suggestions } : {}) } } } }
    : { rich_card: { carousel_card: { card_width: "MEDIUM", card_contents: media.slice(0, 10).map((u, i) => card(u, i === 0)) } }, ...(suggestions.length ? { suggestions } : {}) };
  const fallbackText = withReplyHint(o.text, o.replies ?? []);
  return {
    agent_id: o.agentId, to: o.to, ...(o.profileId ? { messaging_profile_id: o.profileId } : {}),
    agent_message: { content_message },
    ...(media.length ? { mms_fallback: { from: o.from, text: fallbackText, media_urls: media } } : { sms_fallback: { from: o.from, text: fallbackText } }),
  };
}

/** Send as RCS (carrier picks SMS/MMS fallback if needed). Returns the provider id and what it actually went out as. */
export async function sendRcs(to: string, text: string, mediaUrls: string[] = [], replies: string[] = []): Promise<{ id: string; type: string }> {
  const res = await telnyx("/messages/rcs", {
    method: "POST",
    body: JSON.stringify(rcsBody({ agentId: process.env.TELNYX_RCS_AGENT_ID!, profileId: process.env.TELNYX_MESSAGING_PROFILE_ID, from: smsFrom(), to, text, mediaUrls, replies })),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { id?: string; type?: string }; errors?: { detail?: string; title?: string }[] };
  if (!res.ok) throw new Error(`Telnyx RCS ${res.status}: ${data.errors?.[0]?.detail ?? data.errors?.[0]?.title ?? "send failed"}`);
  return { id: data.data?.id ?? "", type: (data.data?.type ?? "RCS").toUpperCase() };
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
    id?: string; text?: string; type?: string; media?: { url?: string; content_type?: string }[];
    body?: { text?: string; suggestion_response?: { text?: string; postback_data?: string }; location?: { latitude?: number; longitude?: number };
      user_file?: { payload?: { file_uri?: string; mime_type?: string; file_name?: string } } };
    from?: { phone_number?: string }; to?: { phone_number?: string; status?: string }[];
    errors?: { detail?: string; title?: string }[];
  } | undefined;
  if (!d || !p?.id) return { kind: "other" };
  if (d.event_type === "message.received" && (p.type ?? "").toUpperCase() === "RCS") {
    // RCS puts content under body: text, a tapped reply button, a shared location, or one file.
    const b = p.body ?? {};
    const loc = b.location?.latitude != null && b.location?.longitude != null ? `📍 https://maps.google.com/?q=${b.location.latitude},${b.location.longitude}` : "";
    const f = b.user_file?.payload;
    return {
      kind: "received", id: p.id, from: toE164(p.from?.phone_number) ?? p.from?.phone_number ?? "", to: smsFrom(), type: "RCS",
      text: b.text ?? b.suggestion_response?.text ?? loc,
      media: f?.file_uri?.startsWith("https://") ? [{ url: f.file_uri, contentType: f.mime_type ?? "application/octet-stream" }] : [],
    };
  }
  if (d.event_type === "message.read") return { kind: "status", id: p.id, status: "read", error: null };
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
export const keyword = (text: string): "STOP" | "START" | "HELP" | null => {
  const w = text.trim().toUpperCase();
  if (["HELP", "INFO", "AIDE"].includes(w)) return "HELP";
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET"].includes(w)) return "STOP";
  if (["START", "UNSTOP", "YES", "SUBSCRIBE"].includes(w)) return "START";
  return null;
};
