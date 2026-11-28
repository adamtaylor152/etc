// Call log: owners log calls by hand; the tick also pulls Telnyx call records for the business number.
import { todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { enqueueSms, kickOutbox } from "../email/outbox";
import { clientName } from "../queries";
import { getSettings } from "../settings";
import { keyword, smsEnabled, smsFrom, toE164 } from "../sms";
import { TransitionError } from "../status/visit";
import { nextTextWindow } from "./campaigns";
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

// ---------- missed-call text-back ----------
/** Did this number's latest STOP/START say STOP? Inbound text bodies, newest first. Pure, unit-tested. */
export const textedStop = (inboundNewestFirst: string[]) => inboundNewestFirst.map(keyword).find((k) => k === "STOP" || k === "START") === "STOP";

/**
 * What a newly logged call earns: a call-back task, and a "sorry we missed you" text at `textAt` (inside the allowed
 * hours: a call missed at night is answered when the window opens). Only inbound calls nobody picked up, from a real
 * number that isn't one of ours, logged while still fresh (the first sync after an outage must not text about
 * yesterday's calls). No text to a number that texted STOP, or that we've talked or texted with since. Pure, unit-tested.
 */
export function missedCallPlan(
  c: { direction: "IN" | "OUT"; status: string; from: string; startedAt: Date },
  f: { stopped: boolean; contactedSince: boolean; staff: boolean }, hours: { from: number; to: number }, now = new Date(),
): { task: boolean; textAt: Date | null } {
  const missed = c.direction === "IN" && (c.status === "missed" || c.status === "no_answer") && !!toE164(c.from);
  if (!missed || f.staff || now.getTime() - c.startedAt.getTime() > 2 * 3_600_000) return { task: false, textAt: null };
  return { task: !f.contactedSince, textAt: f.stopped || f.contactedSince ? null : nextTextWindow(now, hours.from, hours.to) };
}

/** After a sync: text back and make a task for each missed call just logged (Settings: off by default). */
async function followUpMissed(businessId: string, calls: { direction: "IN" | "OUT"; status: string; from: string; startedAt: Date; clientId: string | null }[]) {
  const s = await getSettings(db, businessId);
  if (!s.missedCallText || !calls.length) return;
  const staff = new Set((await db.user.findMany({ where: { businessId }, select: { phone: true } })).map((u) => toE164(u.phone)));
  for (const c of calls) {
    const them = { OR: [{ from: c.from }, { to: c.from }] }, since = { gt: c.startedAt };
    const [client, inbound, calledSince, textedSince] = await Promise.all([
      c.clientId ? db.client.findUnique({ where: { id: c.clientId } }) : null,
      db.textMessage.findMany({ where: { businessId, direction: "IN", from: c.from }, orderBy: { createdAt: "desc" }, take: 100, select: { body: true } }),
      db.callLog.count({ where: { businessId, status: "answered", startedAt: since, ...them } }),
      db.textMessage.count({ where: { businessId, createdAt: since, ...them } }),
    ]);
    const plan = missedCallPlan(c, { stopped: !!client?.smsOptOutAt || textedStop(inbound.map((t) => t.body)), contactedSince: calledSince + textedSince > 0, staff: staff.has(c.from) }, { from: s.missedCallFromHour, to: s.missedCallToHour });
    // They called us, so this answers their call rather than markets to them: it doesn't need the "text me" opt-in, only no STOP.
    // The key is the number and the day it goes out: one text per number per day however often they call.
    const text = plan.textAt && await enqueueSms(db, {
      businessId, template: "sms.missed_call", client: { id: client?.id ?? null, phone: c.from, smsOptIn: true, smsOptOutAt: client?.smsOptOutAt }, props: {},
      dedupeKey: `missed-call:${c.from}:${todayLocal(plan.textAt)}`, sendAfter: plan.textAt,
    });
    if (!plan.task) continue;
    const date = toDbDate(todayLocal()), title = `Call back ${client ? clientName(client) : c.from}`;
    if (await db.task.count({ where: { businessId, title, date, completedAt: null } })) continue; // one open task per caller per day
    const at = c.startedAt.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" });
    await db.task.create({ data: { businessId, title, date, clientId: client?.id, instructions: `Missed call from ${c.from} at ${at}.${text ? " A “sorry we missed you” text is going to them." : ""}` } });
  }
  kickOutbox();
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
  const added = [];
  for (const r of rows) {
    const c = cdrToCall(r, ours);
    if (!c || (await db.callLog.findUnique({ where: { providerId: c.providerId } }))) continue;
    const client = await clientByPhone(businessId, c.direction === "IN" ? c.from : c.to);
    added.push(await db.callLog.create({ data: { ...c, businessId, clientId: client?.id } }));
  }
  // Only calls logged just now, and only after the whole batch is in (so "they got through on a later call" is known).
  await followUpMissed(businessId, added);
  return added.length;
}
