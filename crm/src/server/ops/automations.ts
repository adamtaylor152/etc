// Automated campaigns: a campaign row (same content blocks, tracking and unsubscribe as a hand-sent one) that the hourly
// scheduler sends to whoever is due. Off until switched on in Marketing. Every send goes through queueRecipient with a
// dedupe key, so a re-run, a restart or two containers can never send the same client the same message twice.
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, dateOnly, todayLocal, toDbDate } from "../dates";
import { db } from "../db";
import { kickOutbox } from "../email/outbox";
import { Audience, audienceClients, CAMPAIGN_EMAILS_PER_DAY, lastVisitByClient, paceDay, queueRecipient, RENEW_LINK, type Block } from "./campaigns";
import { env } from "../env";
import { renewalSeason } from "./jobs";

export const AUTOMATION_KEYS = ["WINBACK", "RENEWAL"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

/** The few numbers each automation has (kept in the campaign's `audience` JSON). */
export const AutoConfig = z.object({
  months: z.coerce.number().int().min(1).max(36).default(6),        // win-back: last visit at least this long ago
  daysBefore: z.coerce.number().int().min(1).max(120).default(30),  // renewal: first email this many days before the season starts
  reminderDays: z.coerce.number().int().min(0).max(60).default(14), // renewal: one reminder this many days after the first (0 = none)
});
export type AutoConfig = z.infer<typeof AutoConfig>;

const b = (type: Block["type"], text = "", url = ""): Block => ({ type, text, url });
export const AUTOMATIONS: Record<AutomationKey, { name: string; blurb: string; subject: string; blocks: () => Block[] }> = {
  WINBACK: {
    name: "Win-back", blurb: "Past clients we haven't seen in a while, with nothing booked, quoted or requested. At most once a year each.",
    subject: "It's been a while. Need a hand?",
    blocks: () => [b("heading", "Hi {first_name}, it's been a while!"), b("text", "Thanks again for having us over. If there's snow to clear, a yard to tidy or an odd job that's been waiting, we'd be glad to help again."), b("button", "Book a job", `${env.siteUrl}/book.html`)],
  },
  RENEWAL: {
    name: "Snow plan renewal", blurb: "Clients on last season's every-snowfall plan who haven't renewed, before the season starts, with one reminder. Stops the moment they renew.",
    subject: "Keep your every-snowfall plan?",
    blocks: () => [b("heading", "Stay on our snow route, {first_name}?"), b("text", "Thanks for being on the every-snowfall plan last winter. Renew in one tap: same address, same price, and nothing to pay now."), b("button", "Renew my plan", RENEW_LINK)],
  },
};

/** The automation's campaign row, made with default wording (and switched off) the first time it's asked for. */
export const getAutomation = (businessId: string, key: AutomationKey) => db.campaign.upsert({
  where: { businessId_automation: { businessId, automation: key } }, update: {},
  create: { businessId, automation: key, name: AUTOMATIONS[key].name, channel: "EMAIL", subject: AUTOMATIONS[key].subject, blocks: AUTOMATIONS[key].blocks() as Prisma.InputJsonValue },
});

// ---------- who is due (pure, unit-tested) ----------
const monthsAgo = (now: Date, n: number) => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - n); return d; };

/** Win-back: last completed visit at least `months` ago, nothing open, and no win-back in the last 12 months. */
export function winBackDue(c: { lastVisitAt: Date | null; openWork: boolean; lastSentAt: Date | null }, months: number, now = new Date()) {
  if (!c.lastVisitAt || c.openWork || c.lastVisitAt > monthsAgo(now, months)) return false;
  return !c.lastSentAt || c.lastSentAt <= monthsAgo(now, 12);
}

/**
 * Renewal: the first email goes from `daysBefore` days ahead of the season until it starts; one reminder `reminderDays`
 * after the first actually went out (while the season is still on). Nothing once they've renewed. Dates are YYYY-MM-DD.
 */
export function renewalStep(p: { today: string; seasonStart: string; seasonEnd: string; daysBefore: number; reminderDays: number; renewed: boolean; firstQueued: boolean; firstSentOn: string | null; reminderQueued: boolean }): "first" | "reminder" | null {
  if (p.renewed || p.today > p.seasonEnd) return null;
  if (!p.firstQueued) return p.today >= addDays(p.seasonStart, -p.daysBefore) && p.today < p.seasonStart ? "first" : null;
  return p.reminderDays > 0 && !p.reminderQueued && !!p.firstSentOn && p.today >= addDays(p.firstSentOn, p.reminderDays) ? "reminder" : null;
}

// ---------- who is due (from the database) ----------
const OPEN_VISIT = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] as const;

/**
 * Win-back recipients right now. Consent, unsubscribes and bounces are exactly a manual email campaign's (audienceClients),
 * which also drops anyone with a quote waiting or approved. "Open job" is a job that isn't closed and still has a visit to
 * do, or a snow plan whose season hasn't ended (jobs are rarely closed by hand, so "not closed" alone would block everyone).
 */
export async function winBackList(businessId: string, cfg: AutoConfig, now = new Date()) {
  const [clients, lastVisit, jobs, requests, sent] = await Promise.all([
    audienceClients(businessId, Audience.parse({ hasOpenQuote: "no" }), "EMAIL"),
    lastVisitByClient(businessId),
    db.job.findMany({ where: { businessId, closedAt: null, OR: [{ visits: { some: { state: { in: [...OPEN_VISIT] } } } }, { kind: "SNOW_PLAN", season: { endsOn: { gte: toDbDate(todayLocal(now)) } } }] }, select: { clientId: true } }),
    db.request.findMany({ where: { businessId, status: { in: ["NEW", "ASSESSMENT_SCHEDULED"] } }, select: { clientId: true } }),
    db.emailMessage.findMany({ where: { businessId, dedupeKey: { startsWith: "winback:" } }, select: { clientId: true, createdAt: true } }),
  ]);
  const open = new Set([...jobs, ...requests].map((x) => x.clientId));
  const lastSent = new Map<string, Date>();
  for (const m of sent) { const was = m.clientId && lastSent.get(m.clientId); if (m.clientId && (!was || was < m.createdAt)) lastSent.set(m.clientId, m.createdAt); }
  return clients
    .filter((c) => winBackDue({ lastVisitAt: lastVisit.get(c.id) ?? null, openWork: open.has(c.id), lastSentAt: lastSent.get(c.id) ?? null }, cfg.months, now))
    // One per lapse: the key carries the visit they lapsed after, so even a wiped "last sent" can't repeat it.
    .map((c) => ({ client: c, lastVisitAt: lastVisit.get(c.id)!, key: `winback:${c.id}:${todayLocal(lastVisit.get(c.id)!)}` }));
}

/**
 * Renewal recipients: on last season's plan, no plan (even an ended one) in the season being renewed into. Classified like
 * the existing "Send renewals" email: a notice to an existing plan client, so no marketing-consent test, but it never goes
 * to someone who unsubscribed, bounced or was archived. The first email shares that button's dedupe key, so the two can't both send.
 */
export async function renewalList(businessId: string, cfg: AutoConfig, today = todayLocal()) {
  const season = await renewalSeason(businessId);
  const prev = season && await db.season.findFirst({ where: { businessId, startsOn: { lt: season.startsOn } }, orderBy: { startsOn: "desc" } });
  if (!season || !prev) return { season, firstOn: null, list: [] };
  const plans = await db.job.findMany({ where: { businessId, kind: "SNOW_PLAN", seasonId: { in: [season.id, prev.id] } }, select: { clientId: true, seasonId: true } });
  const renewed = new Set(plans.filter((p) => p.seasonId === season.id).map((p) => p.clientId));
  const clients = await db.client.findMany({ where: { id: { in: plans.filter((p) => p.seasonId === prev.id && !renewed.has(p.clientId)).map((p) => p.clientId) }, marketingOptOut: false, emailBouncedAt: null, archivedAt: null, email: { not: "" } }, orderBy: { lastName: "asc" } });
  const key = (clientId: string) => `renewal:${season.id}:${clientId}`;
  const msgs = new Map((await db.emailMessage.findMany({ where: { businessId, dedupeKey: { in: clients.flatMap((c) => [key(c.id), `${key(c.id)}:reminder`]) } } })).map((m) => [m.dedupeKey, m]));
  const start = dateOnly(season.startsOn)!;
  const list = clients.map((c) => {
    const first = msgs.get(key(c.id)), reminder = msgs.get(`${key(c.id)}:reminder`);
    const step = renewalStep({
      today, seasonStart: start, seasonEnd: dateOnly(season.endsOn)!, daysBefore: cfg.daysBefore, reminderDays: cfg.reminderDays, renewed: false,
      firstQueued: !!first, firstSentOn: first?.status === "SENT" && first.sentAt ? todayLocal(first.sentAt) : null, reminderQueued: !!reminder,
    });
    return { client: c, step, key: step === "reminder" ? `${key(c.id)}:reminder` : key(c.id), firstSent: !!first, reminderSent: !!reminder };
  });
  return { season, firstOn: addDays(start, -cfg.daysBefore), list };
}

/** Hourly (daytime): send every switched-on automation to whoever is due. Paced like a manual campaign. */
export async function runAutomations(now = new Date()) {
  for (const c of await db.campaign.findMany({ where: { automation: { not: null }, automationOn: true, channel: "EMAIL" } })) {
    const biz = await db.business.findUniqueOrThrow({ where: { id: c.businessId } });
    if (!biz.mailingAddress || !c.subject || !(c.blocks as Block[]).length) continue; // what a manual send insists on
    const cfg = AutoConfig.parse(c.audience);
    const at = (i: number) => new Date(now.getTime() + paceDay(i, CAMPAIGN_EMAILS_PER_DAY) * 86_400_000);
    if (c.automation === "WINBACK") {
      for (const [i, d] of (await winBackList(c.businessId, cfg, now)).entries()) await queueRecipient(c, d.client, at(i), d.key);
    } else if (c.automation === "RENEWAL") {
      const due = (await renewalList(c.businessId, cfg, todayLocal(now))).list.filter((d) => d.step);
      for (const [i, d] of due.entries()) {
        const m = await queueRecipient(c, d.client, at(i), d.key);
        if (m && d.step === "reminder" && !m.subject.startsWith("Reminder: ")) await db.emailMessage.update({ where: { id: m.id }, data: { subject: `Reminder: ${m.subject}`.slice(0, 200) } });
      }
    }
  }
  kickOutbox();
}

/** Sent / opened / clicked for an automation, counted like a manual campaign's results. */
export async function automationStats(c: { id: string; businessId: string }) {
  const [sent, recipients] = await Promise.all([
    db.emailMessage.count({ where: { businessId: c.businessId, template: "campaign.email", status: "SENT", clientId: { not: null }, props: { path: ["campaignId"], equals: c.id } } }),
    db.campaignRecipient.findMany({ where: { campaignId: c.id }, select: { openedAt: true, clickedAt: true } }),
  ]);
  return { sent, opened: recipients.filter((r) => r.openedAt).length, clicked: recipients.filter((r) => r.clickedAt).length };
}
