// One activity feed for a client (or a single job/quote/invoice/request, or the whole account):
// work events (ActivityEvent), texts, calls, notes, emails and requests merged newest-first.
import { db } from "./db";
import { money } from "./money";
import { clientName } from "./queries";

export const FEED_TYPES = ["work", "money", "text", "call", "note", "email"] as const;
export type FeedType = (typeof FEED_TYPES)[number];
export type FeedItem = {
  id: string; type: FeedType; object: "request" | "quote" | "job" | "visit" | "invoice" | "payment" | "client" | "storm" | "text" | "call" | "note" | "email";
  at: Date; title: string; detail?: string; href?: string; client?: { id: string; name: string }; tone?: "red" | "green";
  direction?: "IN" | "OUT"; photos?: string[];
};

const EVENT_TITLE: Record<string, string> = {
  "booking.received": "Booked online", "request.created": "Request created", "booking.imported": "Imported booking", "client.created": "Client added",
  "request.archived": "Request archived", "request.unarchived": "Request reopened",
  "quote.created": "Quote created", "quote.sent": "Quote sent", "quote.approved": "Quote approved", "quote.changes_requested": "Client asked for changes to a quote", "quote.declined": "Quote declined", "quote.reopened": "Quote reopened",
  "quote.converted": "Quote converted to a job", "quote.signed": "Quote signed", "review.rated": "Rated us", "referral.rewarded": "Earned a referral credit", "invoice.signed": "Invoice signed", "visit.signed": "Client signed off the visit", "visit.confirmed": "Client confirmed the visit", "visit.reschedule_requested": "Client asked to reschedule",
  "job.created": "Job created", "job.closed": "Job closed", "job.reopened": "Job reopened", "job.updated": "Job edited", "job.schedule_changed": "Repeat schedule changed", "job.paused": "Recurring job paused", "job.resumed": "Recurring job resumed", "job.invoicing_changed": "Invoice schedule changed", "visit.lines_changed": "Visit price changed",
  "plan.created": "Snow plan started", "plan.updated": "Snow plan changed", "plan.paused": "Snow plan paused", "plan.resumed": "Snow plan resumed", "plan.renewed": "Snow plan renewed",
  "visit.en_route": "On the way", "visit.in_progress": "Arrived", "visit.completed": "Visit completed", "visit.checklist_done": "Checklist completed", "visit.skipped": "Visit skipped",
  "visit.extra_added": "Client added an extra to a visit", "visit.extra_removed": "Client removed an extra from a visit",
  "visit.scheduled": "Visit reopened", "visit.cancelled": "Visit cancelled", "visit.scheduled_for": "Visit rescheduled",
  "invoice.created": "Invoice created", "invoice.sent": "Invoice sent", "invoice.edited": "Invoice edited", "invoice.voided": "Invoice voided",
  "payment.received": "Payment received", "payment.matched": "Payment matched", "payment.deleted": "Payment removed",
  "card.saved": "Card saved", "card.removed": "Card removed", "autopay.on": "Auto-pay turned on", "autopay.off": "Auto-pay turned off", "autopay.failed": "Automatic payment failed",
};
const OBJECT_OF: Record<string, FeedItem["object"]> = { Request: "request", Quote: "quote", Job: "job", Visit: "visit", Invoice: "invoice", Payment: "payment", Client: "client", SnowEvent: "storm" };
const HREF: Partial<Record<FeedItem["object"], (id: string) => string>> = {
  request: (id) => `/requests/${id}`, quote: (id) => `/quotes/${id}`, job: (id) => `/jobs/${id}`, visit: (id) => `/visits/${id}`,
  invoice: (id) => `/invoices/${id}`, client: (id) => `/clients/${id}`, storm: (id) => `/snow/${id}`,
};
const CALL_STATUS: Record<string, string> = { answered: "", missed: "Missed", voicemail: "Voicemail", no_answer: "No answer" };
const mins = (s: number | null) => (s == null ? "" : s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);

export type FeedScope = { businessId: string; clientId?: string; jobId?: string; quoteId?: string; invoiceId?: string; requestId?: string };

/** Merge already-mapped items newest first and cut to a page. Pure, unit-tested. */
export function mergeFeed(lists: FeedItem[][], types: readonly FeedType[], limit: number): FeedItem[] {
  return lists.flat().filter((i) => types.includes(i.type)).sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id)).slice(0, limit);
}

export async function activityFeed(scope: FeedScope, opts: { types?: readonly FeedType[]; before?: Date; limit?: number } = {}): Promise<FeedItem[]> {
  const types = opts.types?.length ? opts.types : FEED_TYPES;
  const limit = opts.limit ?? 50;
  const at = opts.before ? { lt: opts.before } : undefined;
  const b = scope.businessId;
  const record = scope.jobId ? "job" : scope.quoteId ? "quote" : scope.invoiceId ? "invoice" : scope.requestId ? "request" : null;
  const recordId = scope.jobId ?? scope.quoteId ?? scope.invoiceId ?? scope.requestId;
  const entityType = { job: "Job", quote: "Quote", invoice: "Invoice", request: "Request" } as const;
  const want = (t: FeedType) => types.includes(t);
  const withClient = !scope.clientId && !record; // account-wide feed shows who each row is about

  const [events, texts, calls, notes, emails] = await Promise.all([
    want("work") || want("money")
      ? db.activityEvent.findMany({
          where: { businessId: b, at, ...(scope.clientId ? { clientId: scope.clientId } : {}),
            ...(record === "job" ? { OR: [{ jobId: recordId }, { entityType: "Job", entityId: recordId }] } : record ? { entityType: entityType[record], entityId: recordId } : {}) },
          orderBy: { at: "desc" }, take: limit,
        })
      : [],
    want("text") && !record ? db.textMessage.findMany({ where: { businessId: b, createdAt: at, ...(scope.clientId ? { clientId: scope.clientId } : {}) }, include: { media: { where: { mediaType: "IMAGE", deletedAt: null }, select: { id: true } }, client: withClient }, orderBy: { createdAt: "desc" }, take: limit }) : [],
    want("call") && !record ? db.callLog.findMany({ where: { businessId: b, startedAt: at, ...(scope.clientId ? { clientId: scope.clientId } : {}) }, include: { client: withClient }, orderBy: { startedAt: "desc" }, take: limit }) : [],
    want("note") ? db.note.findMany({
      where: { businessId: b, createdAt: at, ...(scope.clientId ? { clientId: scope.clientId } : {}), ...(record ? { [`${record}Id`]: recordId } : {}) },
      include: { attachments: { where: { deletedAt: null, mediaType: "IMAGE" }, select: { id: true } }, client: withClient }, orderBy: { createdAt: "desc" }, take: limit,
    }) : [],
    want("email") && !record ? db.emailMessage.findMany({
      where: { businessId: b, createdAt: at, clientId: scope.clientId ?? { not: null }, template: { not: { startsWith: "sms." } } },
      orderBy: { createdAt: "desc" }, take: limit,
    }) : [],
  ]);
  // Record numbers for titles ("Quote sent #12"), one query per type.
  const idsOf = (t: string) => [...new Set(events.filter((e) => e.entityType === t).map((e) => e.entityId))];
  const [qn, jn, inv, rn] = await Promise.all([
    idsOf("Quote").length ? db.quote.findMany({ where: { id: { in: idsOf("Quote") } }, select: { id: true, number: true } }) : [],
    idsOf("Job").length ? db.job.findMany({ where: { id: { in: idsOf("Job") } }, select: { id: true, number: true } }) : [],
    idsOf("Invoice").length ? db.invoice.findMany({ where: { id: { in: idsOf("Invoice") } }, select: { id: true, number: true } }) : [],
    idsOf("Request").length ? db.request.findMany({ where: { id: { in: idsOf("Request") } }, select: { id: true, number: true } }) : [],
  ]);
  const numbers = new Map([...qn, ...jn, ...inv, ...rn].map((r) => [r.id, r.number]));
  const clientIds = withClient ? [...new Set([...events.map((e) => e.clientId), ...emails.map((e) => e.clientId)].filter((x): x is string => !!x))] : [];
  const names = new Map((clientIds.length ? await db.client.findMany({ where: { id: { in: clientIds } } }) : []).map((c) => [c.id, clientName(c)]));
  const who = (id: string | null | undefined, c?: { id: string; firstName: string; lastName: string; companyName: string | null } | null) =>
    c ? { id: c.id, name: clientName(c) } : id && names.has(id) ? { id, name: names.get(id)! } : undefined;

  return mergeFeed([
    events.map((e): FeedItem => {
      const object = OBJECT_OF[e.entityType] ?? "client";
      const d = (e.data ?? {}) as Record<string, unknown>;
      const isMoney = object === "payment" || e.type.startsWith("payment.") || e.type === "invoice.sent";
      const n = typeof d.number === "number" ? d.number : numbers.get(e.entityId);
      const num = n != null && !EVENT_TITLE[e.type]?.includes("#") ? ` · ${e.entityType === "Invoice" ? "Invoice" : e.entityType === "Quote" ? "Quote" : e.entityType === "Job" ? "Job" : "Request"} #${n}` : "";
      const amount = typeof d.amountCents === "number" ? money(d.amountCents) : typeof d.totalCents === "number" ? money(d.totalCents) : "";
      return {
        id: e.id, type: isMoney ? "money" : "work", object, at: e.at, title: `${EVENT_TITLE[e.type] ?? e.type}${num}`,
        detail: [amount, typeof d.method === "string" ? d.method.toLowerCase().replace("etransfer", "e-Transfer") : "", typeof d.reason === "string" ? d.reason : ""].filter(Boolean).join(" · ") || undefined,
        href: object === "payment" && typeof d.invoiceId === "string" ? `/invoices/${d.invoiceId}` : HREF[object]?.(e.entityId),
        client: who(e.clientId), tone: e.type === "payment.received" ? "green" : e.type === "visit.skipped" || e.type === "invoice.voided" ? "red" : undefined,
      };
    }),
    texts.map((t): FeedItem => ({
      id: t.id, type: "text", object: "text", at: t.createdAt, direction: t.direction,
      title: t.direction === "IN" ? "Text received" : t.status.includes("fail") ? "Text not sent" : "Text sent",
      detail: t.body || (t.media.length ? "📷 Photo" : ""), photos: t.media.map((m) => m.id),
      href: `/messages/${t.clientId ?? `n${(t.direction === "IN" ? t.from : t.to).replace("+", "")}`}`, client: who(t.clientId, "client" in t ? t.client : null),
      tone: t.status.includes("fail") ? "red" : undefined,
    })),
    calls.map((c): FeedItem => ({
      id: c.id, type: "call", object: "call", at: c.startedAt, direction: c.direction,
      title: `${CALL_STATUS[c.status] ? `${CALL_STATUS[c.status]} call` : c.direction === "IN" ? "Incoming call" : "Outgoing call"}${c.durationSec ? ` · ${mins(c.durationSec)}` : ""}`,
      detail: c.notes ?? undefined, client: who(c.clientId, "client" in c ? c.client : null), tone: c.status === "missed" ? "red" : undefined,
      href: c.clientId ? `/clients/${c.clientId}?tab=activity` : undefined,
    })),
    notes.map((n): FeedItem => ({
      id: n.id, type: "note", object: "note", at: n.createdAt, title: n.pinned ? "Pinned note" : "Note", detail: n.body, photos: n.attachments.map((a) => a.id),
      client: who(n.clientId, "client" in n ? n.client : null),
    })),
    emails.map((m): FeedItem => ({
      id: m.id, type: "email", object: "email", at: m.sentAt ?? m.createdAt, title: m.status === "FAILED" ? "Email failed" : m.status === "SENT" ? "Email sent" : "Email queued",
      detail: m.subject, client: who(m.clientId), tone: m.status === "FAILED" ? "red" : undefined,
    })),
  ], types, limit);
}
