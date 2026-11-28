// Text message bodies. Short, plain, signed "- etc." Links are minted at send time (no raw tokens stored).
import { dateOnly, dayWord, todayLocal } from "../dates";
import { db } from "../db";
import { env } from "../env";
import { routeEnds } from "../routing";
import { travelMatrix } from "../routing-matrix";
import { etaWindow } from "../routing/eta";
import { mintToken } from "../tokens";
import { money } from "../money";
import { dollars } from "../ops/drive-size";
import { prettyDate } from "../dates";
import { dayCount, dayLines } from "../runner";
import { smsMeta, smsText, type SmsKey } from "./wording";
import { skipNotice } from "../status/visit";

type Ctx = { businessId: string };
const first = (n: string) => n.trim().split(" ")[0] || "there";
/** A text the owner can reword (Settings › Messages): the template supplies the values, wording.ts has the built-in words. */
const worded = (key: SmsKey, vars: Record<string, string>) => ({ key, vars });

/**
 * ", arriving around 9:00-9:30am" for a visit the crew just set off to, or "" when we can't say honestly: only with
 * real road times (never the straight-line guess), from where the crew last finished today (else their start point).
 */
async function arrival(v: { id: string; businessId: string; enRouteAt: Date | null; scheduledDate: Date | null; property: { lat: number | null; lng: number | null }; assignees: { userId: string }[] }) {
  if (!v.enRouteAt || v.property.lat == null || v.property.lng == null) return "";
  const crew = v.assignees.map((a) => a.userId);
  const last = await db.visit.findFirst({
    where: { businessId: v.businessId, id: { not: v.id }, state: "COMPLETED", completedAt: { gte: new Date(v.enRouteAt.getTime() - 3 * 3_600_000), lte: v.enRouteAt }, ...(crew.length ? { assignees: { some: { userId: { in: crew } } } } : {}) },
    orderBy: { completedAt: "desc" }, select: { property: { select: { lat: true, lng: true } } },
  });
  const from = last?.property.lat != null && last.property.lng != null ? { lat: last.property.lat, lng: last.property.lng } : (await routeEnds(v.businessId, crew[0])).start;
  const m = await travelMatrix([from, { lat: v.property.lat, lng: v.property.lng }]);
  const min = m.minutes[0][1];
  return m.road && min <= 90 ? `, arriving around ${etaWindow(new Date(v.enRouteAt.getTime() + min * 60_000))}` : "";
}

export const smsTemplates = {
  "sms.on_my_way": async (p: { visitId: string }) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true, assignees: { select: { userId: true } } } });
    return worded("sms.on_my_way", { first_name: first(v.job.client.firstName), address: v.property.formatted.split(",")[0], arrival: await arrival(v) });
  },
  "sms.visit_done": async (p: { visitId: string }, ctx: Ctx) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    const raw = await mintToken(db, ctx.businessId, "VISIT_REPORT", { visitId: v.id, clientId: v.job.clientId });
    return worded("sms.visit_done", { first_name: first(v.job.client.firstName), address: v.property.formatted.split(",")[0], link: `${env.appUrl}/v/${raw}` });
  },
  "sms.storm_heads_up": async (p: { visitId: string }) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    return worded("sms.storm_heads_up", { first_name: first(v.job.client.firstName), address: v.property.formatted.split(",")[0] });
  },
  // Once, when someone ticks "text me" on the booking form (carriers and RCS review expect a confirmation).
  "sms.review_request": async (p: { clientId: string; reviewId: string; followUp?: boolean }, ctx: Ctx) => {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    const raw = await mintToken(db, ctx.businessId, "REVIEW", { clientId: c.id, redirectPath: p.reviewId });
    if (p.followUp) return `Hi ${first(c.firstName)}, got 30 seconds to tell us how we did? ${env.appUrl}/r/${raw} We won't ask again. - etc.`;
    return worded("sms.review_request", { first_name: first(c.firstName), link: `${env.appUrl}/r/${raw}` });
  },
  "sms.visit_skipped": async (p: { visitId: string }) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    const n = skipNotice(v.skipReason)!;
    return `Hi ${first(v.job.client.firstName)}, we came by ${v.property.formatted.split(",")[0]} but ${n.what}. No charge for this visit. ${n.next} - etc.`;
  },
  // To whoever called and got no answer (maybe not a client yet). Once per number per day; see ops/calls.ts.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- no props, but enqueueSms needs a props type
  "sms.missed_call": async (_p: Record<string, never>) => `Sorry we missed your call! Reply here by text, or book at ${env.siteUrl}/book.html - etc. (Reply STOP to opt out)`,
  "sms.visit_reminder": async (p: { visitId: string }, ctx: Ctx) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    const raw = await mintToken(db, ctx.businessId, "VISIT_CONFIRM", { visitId: v.id, clientId: v.job.clientId });
    return worded("sms.visit_reminder", { first_name: first(v.job.client.firstName), address: v.property.formatted.split(",")[0], day: dayWord(dateOnly(v.scheduledDate) ?? todayLocal()), link: `${env.appUrl}/c/${raw}` });
  },
  "sms.price_change": async (p: { jobId: string }, ctx: Ctx) => {
    const job = await db.job.findUniqueOrThrow({ where: { id: p.jobId }, include: { client: true, property: true } });
    const pend = job.pendingPrice as { base: number; walk: number } | null;
    const raw = await mintToken(db, ctx.businessId, "PRICE_CHANGE", { jobId: job.id, clientId: job.clientId });
    const price = pend ? `${dollars(pend.base + pend.walk)}${job.kind === "SNOW_PLAN" ? " per snowfall" : ""}` : "a new price";
    return worded("sms.price_change", { first_name: first(job.client.firstName), address: job.property.formatted.split(",")[0], price, link: `${env.appUrl}/p/${raw}` });
  },
  // Same tokenized link as the quote email; the title is kept short so the link is never clipped off the end.
  "sms.quote": async (p: { quoteId: string; followUp?: boolean }, ctx: Ctx) => {
    const q = await db.quote.findUniqueOrThrow({ where: { id: p.quoteId }, include: { client: true } });
    const url = `${env.appUrl}/q/${await mintToken(db, ctx.businessId, "QUOTE", { quoteId: q.id, clientId: q.clientId })}`;
    const what = (q.title ?? "your job").slice(0, 60);
    return worded(p.followUp ? "sms.quote_follow_up" : "sms.quote", { first_name: first(q.client.firstName), quote_title: what, total: money(q.totalCents), link: url });
  },
  "sms.campaign": async (p: { campaignId: string; clientId: string }) => {
    const c = await db.campaign.findUniqueOrThrow({ where: { id: p.campaignId } });
    return `${(c.smsBody ?? "").trim()} Reply STOP to opt out.`;
  },
  "sms.referral_thanks": async (p: { clientId: string; cents: number }) => {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    return worded("sms.referral_thanks", { first_name: first(c.firstName), amount: `$${(p.cents / 100).toFixed(0)}` });
  },
  // To someone on the team (not a client): their day changed. Built at send time; never prices.
  "sms.crew_assignment": async (p: { userId: string; date: string }, ctx: Ctx) => {
    const day = await dayLines(ctx.businessId, p.userId, p.date);
    const first = day.stops[0] ?? day.tasks[0];
    return `etc. crew: your work for ${prettyDate(p.date)} was updated (${dayCount(day)}). ${env.appUrl}/run?date=${p.date}${first ? ` First: ${first}` : ""}`;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- no props, but enqueueSms needs a props type
  "sms.opt_in": async (_p: Record<string, never>) => "You're signed up for etc. booking texts. Reply STOP to stop, HELP for help.",
} satisfies Record<string, (p: never, ctx: Ctx) => Promise<string | ReturnType<typeof worded>>>;

export type SmsTemplateName = keyof typeof smsTemplates;

/** The text to send. Rewordable ones use the owner's wording when there is one, with the parts a text can't go without put back. */
export async function renderSms(template: SmsTemplateName, props: unknown, ctx: Ctx) {
  const t = smsTemplates[template] as ((p: unknown, ctx: Ctx) => Promise<string | ReturnType<typeof worded>>) | undefined;
  if (!t) throw new Error(`unknown sms template ${template}`);
  const out = await t(props, ctx);
  if (typeof out === "string") return out;
  const o = await db.emailTemplateOverride.findFirst({ where: { businessId: ctx.businessId, template: out.key, enabled: true }, select: { body: true } });
  if (!o?.body?.trim() || !smsMeta(out.key)) return smsText(out.key, null, out.vars);
  const biz = await db.business.findUniqueOrThrow({ where: { id: ctx.businessId }, select: { name: true, phone: true } });
  return smsText(out.key, o.body, { ...out.vars, business_name: biz.name, business_phone: biz.phone ?? env.phone });
}
