// Call log: owners log calls by hand; the tick also pulls Telnyx call records for the business number.
import { db } from "../db";
import { smsEnabled, smsFrom, toE164 } from "../sms";
import { TransitionError } from "../status/visit";
import { clientByPhone } from "./texts";

type Actor = { id: string; businessId: string };

export async function logCall(user: Actor, input: { clientId?: string; number?: string; direction: "IN" | "OUT"; status: string; startedAt?: Date; durationMin?: number; notes?: string }) {
  const client = input.clientId ? await db.client.findFirst({ where: { id: input.clientId, businessId: user.businessId } }) : null;
  const other = client ? toE164(client.phone) ?? client.phone ?? "" : toE164(input.number) ?? "";
  if (!client && !other) throw new TransitionError("Pick a client or enter their number");
  const ours = smsFrom() || "+14036568200";
  return db.callLog.create({
    data: {
      businessId: user.businessId, clientId: client?.id ?? (other ? (await clientByPhone(user.businessId, other))?.id : undefined),
      direction: input.direction, from: input.direction === "IN" ? other : ours, to: input.direction === "IN" ? ours : other,
      status: ["answered", "missed", "voicemail", "no_answer"].includes(input.status) ? input.status : "answered",
      startedAt: input.startedAt ?? new Date(), durationSec: input.durationMin != null ? Math.round(input.durationMin * 60) : null,
      notes: input.notes?.trim().slice(0, 2000) || null, loggedById: user.id,
    },
  });
}

type Cdr = { id?: string; uuid?: string; direction?: string; cli?: string; cld?: string; from?: string; to?: string; started_at?: string; start_time?: string; created_at?: string; call_sec?: number; duration?: number; billsec?: number; hangup_cause?: string; status?: string };

/** Map one Telnyx call detail record to a CallLog row (null if it isn't a call on our number). Pure, unit-tested. */
export function cdrToCall(r: Cdr, ours: string) {
  const id = r.id ?? r.uuid;
  const from = toE164(r.cli ?? r.from), to = toE164(r.cld ?? r.to);
  if (!id || (from !== ours && to !== ours)) return null;
  // A forwarded call shows up twice: the inbound leg (caller -> us) and the outbound forward leg to the cell. Keep the inbound one.
  if (to === ours && r.direction === "outbound") return null;
  const direction = to === ours ? ("IN" as const) : ("OUT" as const);
  const sec = r.call_sec ?? r.billsec ?? r.duration ?? 0;
  const startedAt = new Date(r.started_at ?? r.start_time ?? r.created_at ?? Date.now());
  const cause = (r.hangup_cause ?? r.status ?? "").toLowerCase();
  return {
    providerId: id, direction, from: from ?? "", to: to ?? "", startedAt, durationSec: sec || null,
    status: sec > 0 ? "answered" : cause.includes("busy") ? "no_answer" : "missed", // 0 seconds = nobody picked up
  };
}

/** Tick (every few minutes): pull recent Telnyx call records and log new ones. Quietly does nothing if Telnyx isn't set up. */
export async function syncTelnyxCalls(businessId: string) {
  if (!smsEnabled() || process.env.TELNYX_CALL_SYNC === "off") return 0;
  const ours = smsFrom();
  // "Forward Only" calls are recorded as sip-trunking legs; filter to calls to our number (the Telnyx account also has other numbers).
  const res = await fetch(`https://api.telnyx.com/v2/detail_records?filter[record_type]=sip-trunking&filter[date_range]=last_2_days&filter[cld]=${encodeURIComponent(ours)}&page[size]=100`, {
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return 0;
  const rows = ((await res.json().catch(() => ({}))) as { data?: Cdr[] }).data ?? [];
  let added = 0;
  for (const r of rows) {
    const c = cdrToCall(r, ours);
    if (!c || (await db.callLog.findUnique({ where: { providerId: c.providerId } }))) continue;
    const client = await clientByPhone(businessId, c.direction === "IN" ? c.from : c.to);
    await db.callLog.create({ data: { ...c, businessId, clientId: client?.id } });
    added++;
  }
  return added;
}
