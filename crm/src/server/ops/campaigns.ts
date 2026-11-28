// Email and text campaigns: audiences, Canadian anti-spam (CASL) consent, quiet hours for texts, pacing under the email cap,
// unsubscribe links and open/click tracking.
import { createHmac, timingSafeEqual } from "node:crypto";
import { signingSecret } from "../secret";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, localDayStart, todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { smsEnabled, toE164 } from "../sms";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };

export const Audience = z.object({
  status: z.enum(["any", "lead", "active", "past"]).default("any"),
  tags: z.array(z.string()).default([]),
  communities: z.array(z.string()).default([]),
  service: z.string().default(""), // had a job/invoice line containing this text
  lastVisitBefore: z.string().default(""), lastVisitAfter: z.string().default(""),
  hasSnowPlan: z.enum(["any", "yes", "no"]).default("any"),
  hasOpenQuote: z.enum(["any", "yes", "no"]).default("any"),
});
export type Audience = z.infer<typeof Audience>;
export const Block = z.object({ type: z.enum(["heading", "text", "button", "divider"]), text: z.string().max(4000).default(""), url: z.string().max(500).default("") });
export type Block = z.infer<typeof Block>;
/** In a button link: replaced per client with their hub page, where "Renew my plan" is one tap. */
export const RENEW_LINK = "{renew_link}";

// ---------- consent (pure, unit-tested) ----------
/** CASL: express consent, or implied — a purchase in the last 2 years or an inquiry in the last 6 months. */
export function emailConsent(c: { email: string; marketingOptOut: boolean; emailBouncedAt?: Date | null; emailMarketingConsentAt?: Date | null }, lastPurchaseAt: Date | null, lastInquiryAt: Date | null, now = new Date()) {
  if (!c.email || c.marketingOptOut || c.emailBouncedAt) return null;
  if (c.emailMarketingConsentAt) return "express" as const;
  const day = 86_400_000;
  if (lastPurchaseAt && now.getTime() - lastPurchaseAt.getTime() <= 730 * day) return "implied-purchase" as const;
  if (lastInquiryAt && now.getTime() - lastInquiryAt.getTime() <= 183 * day) return "implied-inquiry" as const;
  return null;
}
export const smsConsent = (c: { phone: string | null; smsOptIn: boolean; smsOptOutAt?: Date | null; marketingOptOut: boolean }) => !!toE164(c.phone) && c.smsOptIn && !c.smsOptOutAt && !c.marketingOptOut;

/** No marketing texts 9pm–9am Calgary time (other hours for other automatic texts): returns when it's OK to send. Pure, unit-tested. */
export function nextTextWindow(now = new Date(), from = 9, to = 21) {
  const hour = Number(now.toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", hourCycle: "h23" }));
  if (hour >= from && hour < to) return now;
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  return new Date(localDayStart(hour >= to ? addDays(today, 1) : today).getTime() + from * 3_600_000);
}

/** Spread n emails over days at perDay. Returns the day offset for item i. Pure, unit-tested. */
export const paceDay = (i: number, perDay: number) => Math.floor(i / Math.max(1, perDay));

// ---------- signed links (unsubscribe, tracking) ----------
const sig = (v: string) => createHmac("sha256", signingSecret()).update(`campaign:${v}`).digest("base64url").slice(0, 22);
export const signed = (v: string) => `${v}.${sig(v)}`;
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function verifySigned(token: string) {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const v = token.slice(0, i);
  return same(token.slice(i + 1), sig(v)) ? v : null;
}
export const unsubscribeUrl = (clientId: string) => `${env.appUrl}/unsubscribe/${signed(clientId)}`;
export const openPixelUrl = (recipientId: string) => `${env.appUrl}/api/m/o/${signed(recipientId)}`;
export const clickUrl = (recipientId: string, url: string) => `${env.appUrl}/api/m/c/${signed(recipientId)}?u=${encodeURIComponent(url)}&s=${sig(`${recipientId}|${url}`)}`;
export const verifyClick = (recipientId: string, url: string, s: string) => same(s, sig(`${recipientId}|${url}`));

// ---------- audiences ----------
/** When each client's last completed visit was. */
export async function lastVisitByClient(businessId: string) {
  const lastVisits = await db.visit.groupBy({ by: ["jobId"], where: { businessId, state: "COMPLETED" }, _max: { completedAt: true } });
  const jobOwner = new Map((await db.job.findMany({ where: { businessId }, select: { id: true, clientId: true } })).map((j) => [j.id, j.clientId]));
  const lastVisit = new Map<string, Date>();
  for (const v of lastVisits) { const cid = jobOwner.get(v.jobId); if (cid && v._max.completedAt && (!lastVisit.get(cid) || v._max.completedAt > lastVisit.get(cid)!)) lastVisit.set(cid, v._max.completedAt); }
  return lastVisit;
}

export async function audienceClients(businessId: string, a: Audience, channel: "EMAIL" | "SMS") {
  const where: Prisma.ClientWhereInput = { businessId, archivedAt: null };
  if (a.tags.length) where.tags = { hasSome: a.tags };
  if (a.communities.length) where.properties = { some: { communityCode: { in: a.communities }, archivedAt: null } };
  const clients = await db.client.findMany({
    where,
    include: {
      jobs: { select: { kind: true, closedAt: true, lineItems: { select: { name: true } } } },
      invoices: { where: { status: { in: ["PAID", "AWAITING_PAYMENT"] } }, select: { issuedOn: true, createdAt: true } },
      requests: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      quotes: { where: { status: { in: ["AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED"] } }, select: { id: true } },
    },
  });
  const lastVisit = await lastVisitByClient(businessId);
  const svc = a.service.trim().toLowerCase();
  const before = a.lastVisitBefore ? toDbDate(a.lastVisitBefore) : null, after = a.lastVisitAfter ? toDbDate(a.lastVisitAfter) : null;
  return clients.filter((c) => {
    const active = c.jobs.some((j) => !j.closedAt);
    const status = !c.jobs.length && !c.invoices.length ? "lead" : active ? "active" : "past";
    if (a.status !== "any" && a.status !== status) return false;
    if (svc && !c.jobs.some((j) => j.lineItems.some((l) => l.name.toLowerCase().includes(svc)))) return false;
    const lv = lastVisit.get(c.id);
    if (before && (!lv || lv >= before)) return false;
    if (after && (!lv || lv < after)) return false;
    const plan = c.jobs.some((j) => j.kind === "SNOW_PLAN" && !j.closedAt);
    if (a.hasSnowPlan !== "any" && (a.hasSnowPlan === "yes") !== plan) return false;
    if (a.hasOpenQuote !== "any" && (a.hasOpenQuote === "yes") !== c.quotes.length > 0) return false;
    if (channel === "SMS") return smsConsent(c);
    const lastPurchase = c.invoices.map((i) => i.issuedOn ?? i.createdAt).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
    return !!emailConsent(c, lastPurchase, c.requests[0]?.createdAt ?? null);
  });
}

// ---------- sending ----------
export const CAMPAIGN_EMAILS_PER_DAY = Number(process.env.CAMPAIGN_EMAILS_PER_DAY ?? 200); // leaves room under Brevo's 300/day

export async function sendCampaign(user: Actor, campaignId: string, opts: { testTo?: string[]; at?: Date | null } = {}) {
  const c = await db.campaign.findFirst({ where: { id: campaignId, businessId: user.businessId } });
  if (!c) throw new TransitionError("That campaign is gone");
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  if (c.channel === "EMAIL" && !biz.mailingAddress) throw new TransitionError("Add your business mailing address in Settings first (Canada's anti-spam law requires it in marketing emails)");
  if (c.channel === "EMAIL" && (!c.subject || !(c.blocks as Block[]).length)) throw new TransitionError("Add a subject and some content");
  if (c.channel === "SMS" && (!c.smsBody?.trim() || !smsEnabled())) throw new TransitionError(smsEnabled() ? "Write the text message" : "Texting isn't set up");
  if (opts.testTo?.length) {
    for (const to of opts.testTo) await enqueue(db, { businessId: user.businessId, template: "campaign.email", to, priority: 2, props: { campaignId: c.id, recipientId: "test", clientId: "" } });
    kickOutbox();
    return { queued: opts.testTo.length, days: 0 };
  }
  if (c.automation) throw new TransitionError("Automations send themselves: switch it on instead"); // only the test above is by hand
  if (c.status !== "DRAFT" && c.status !== "SCHEDULED") throw new TransitionError("This campaign was already sent");
  const clients = await audienceClients(user.businessId, Audience.parse(c.audience), c.channel);
  if (!clients.length) throw new TransitionError("Nobody in this audience can receive it (check consent and filters)");
  const start = opts.at && opts.at > new Date() ? opts.at : new Date();
  await db.campaign.update({ where: { id: c.id }, data: { status: start > new Date() ? "SCHEDULED" : "SENDING", scheduledFor: start, sentAt: new Date() } });
  for (const [i, cl] of clients.entries()) {
    const sendAfter = c.channel === "EMAIL" ? new Date(start.getTime() + paceDay(i, CAMPAIGN_EMAILS_PER_DAY) * 86_400_000) : nextTextWindow(start);
    await queueRecipient(c, cl, sendAfter, `campaign:${c.id}:${cl.id}`);
  }
  // Scheduled for later: stays SCHEDULED (and can be cancelled) until its time; the hourly run then marks it sent.
  await db.campaign.update({ where: { id: c.id }, data: { status: start > new Date() ? "SCHEDULED" : "SENT" } });
  kickOutbox();
  return { queued: clients.length, days: c.channel === "EMAIL" ? paceDay(clients.length - 1, CAMPAIGN_EMAILS_PER_DAY) + 1 : 1 };
}

/** One client's copy of a campaign into the outbox (the dedupe key makes a second call a no-op). Manual sends and automations both go through here. */
export async function queueRecipient(c: { id: string; businessId: string; channel: "EMAIL" | "SMS" }, cl: { id: string; email: string; phone: string | null; smsOptOutAt: Date | null }, sendAfter: Date, dedupeKey: string) {
  const r = await db.campaignRecipient.upsert({ where: { campaignId_clientId: { campaignId: c.id, clientId: cl.id } }, create: { campaignId: c.id, clientId: cl.id, sendAfter }, update: {} });
  if (c.channel === "EMAIL") {
    return enqueue(db, { businessId: c.businessId, template: "campaign.email", to: cl.email, priority: 9, props: { campaignId: c.id, recipientId: r.id, clientId: cl.id }, dedupeKey, clientId: cl.id, sendAfter });
  }
  return enqueueSms(db, { businessId: c.businessId, template: "sms.campaign", client: { ...cl, smsOptIn: true }, props: { campaignId: c.id, clientId: cl.id }, dedupeKey, sendAfter });
}

/** Hourly: a scheduled campaign whose time has come is "sent" (its emails are already in the outbox). */
export const markScheduledSent = () => db.campaign.updateMany({ where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } }, data: { status: "SENT" } });

/**
 * Stop a campaign that hasn't (all) gone out: whatever is still waiting in the outbox is suppressed, never sent, and can't be
 * re-queued (the dedupe key stays). The outbox claims rows by flipping QUEUED -> SENDING, so a message is either stopped here or sent, never both.
 */
export async function cancelCampaign(user: Actor, campaignId: string) {
  const c = await db.campaign.findFirst({ where: { id: campaignId, businessId: user.businessId, automation: null } });
  if (!c) throw new TransitionError("That campaign is gone");
  const prefix = { businessId: user.businessId, dedupeKey: { startsWith: `campaign:${c.id}:` } };
  const stopped = await db.emailMessage.updateMany({ where: { ...prefix, status: "QUEUED" }, data: { status: "SUPPRESSED", lastError: "campaign cancelled" } });
  if (!stopped.count) throw new TransitionError("Nothing left to cancel: this campaign has already gone out");
  const gone = (await db.emailMessage.findMany({ where: { ...prefix, status: "SUPPRESSED", lastError: "campaign cancelled" }, select: { clientId: true } })).flatMap((m) => m.clientId ?? []);
  await db.campaignRecipient.deleteMany({ where: { campaignId: c.id, clientId: { in: gone } } }); // results only count people it reached
  await db.campaign.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
  return stopped.count;
}

/** How many of a campaign's messages are still waiting to go (what Cancel would stop). */
export const campaignQueued = (businessId: string, campaignId: string) =>
  db.emailMessage.count({ where: { businessId, dedupeKey: { startsWith: `campaign:${campaignId}:` }, status: "QUEUED" } });

/** Copy any campaign (sent, cancelled, draft) into a new draft: same content and audience, no recipients. */
export async function duplicateCampaign(user: Actor, campaignId: string) {
  const c = await db.campaign.findFirst({ where: { id: campaignId, businessId: user.businessId, automation: null } });
  if (!c) throw new TransitionError("That campaign is gone");
  return db.campaign.create({ data: {
    businessId: user.businessId, name: `Copy of ${c.name}`.slice(0, 120), channel: c.channel, subject: c.subject, smsBody: c.smsBody, createdById: user.id,
    blocks: c.blocks as Prisma.InputJsonValue, audience: c.audience as Prisma.InputJsonValue,
  } });
}

export const todayStr = () => todayLocal();
