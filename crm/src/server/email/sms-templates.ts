// Text message bodies. Short, plain, signed "- etc." Links are minted at send time (no raw tokens stored).
import { dateOnly, dayWord, todayLocal } from "../dates";
import { db } from "../db";
import { env } from "../env";
import { mintToken } from "../tokens";
import { dollars } from "../ops/drive-size";
import { prettyDate } from "../dates";
import { dayCount, dayLines } from "../runner";

type Ctx = { businessId: string };
const first = (n: string) => n.trim().split(" ")[0] || "there";

export const smsTemplates = {
  "sms.on_my_way": async (p: { visitId: string }) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    return `Hi ${first(v.job.client.firstName)}, the etc. crew is on the way to ${v.property.formatted.split(",")[0]}. No need to be home. - etc. (Reply STOP to opt out)`;
  },
  "sms.visit_done": async (p: { visitId: string }, ctx: Ctx) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    const raw = await mintToken(db, ctx.businessId, "VISIT_REPORT", { visitId: v.id, clientId: v.job.clientId });
    return `All done at ${v.property.formatted.split(",")[0]}! Before & after photos: ${env.appUrl}/v/${raw} - etc.`;
  },
  "sms.storm_heads_up": async (p: { visitId: string }) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    return `Snow day! ${first(v.job.client.firstName)}, you're on our route today for ${v.property.formatted.split(",")[0]}. Away? Just reply. - etc.`;
  },
  // Once, when someone ticks "text me" on the booking form (carriers and RCS review expect a confirmation).
  "sms.review_request": async (p: { clientId: string; reviewId: string }, ctx: Ctx) => {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    const raw = await mintToken(db, ctx.businessId, "REVIEW", { clientId: c.id, redirectPath: p.reviewId });
    return `Hi ${first(c.firstName)}, thanks for choosing etc.! How did we do? ${env.appUrl}/r/${raw} - etc.`;
  },
  "sms.visit_reminder": async (p: { visitId: string }, ctx: Ctx) => {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    const raw = await mintToken(db, ctx.businessId, "VISIT_CONFIRM", { visitId: v.id, clientId: v.job.clientId });
    return `Hi ${first(v.job.client.firstName)}, etc. is booked for ${v.property.formatted.split(",")[0]} ${dayWord(dateOnly(v.scheduledDate) ?? todayLocal())}. Reply YES to confirm, or change it here: ${env.appUrl}/c/${raw} - etc.`;
  },
  "sms.price_change": async (p: { jobId: string }, ctx: Ctx) => {
    const job = await db.job.findUniqueOrThrow({ where: { id: p.jobId }, include: { client: true, property: true } });
    const pend = job.pendingPrice as { base: number; walk: number } | null;
    const raw = await mintToken(db, ctx.businessId, "PRICE_CHANGE", { jobId: job.id, clientId: job.clientId });
    const price = pend ? `${dollars(pend.base + pend.walk)}${job.kind === "SNOW_PLAN" ? " per snowfall" : ""}` : "a new price";
    return `Hi ${first(job.client.firstName)}, we checked ${job.property.formatted.split(",")[0]}: it's bigger than a standard driveway, so it's ${price}. OK it or cancel (no charge): ${env.appUrl}/p/${raw} - etc.`;
  },
  "sms.campaign": async (p: { campaignId: string; clientId: string }) => {
    const c = await db.campaign.findUniqueOrThrow({ where: { id: p.campaignId } });
    return `${(c.smsBody ?? "").trim()} Reply STOP to opt out.`;
  },
  "sms.referral_thanks": async (p: { clientId: string; cents: number }) => {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    return `Thanks for sending a neighbour our way, ${first(c.firstName)}! $${(p.cents / 100).toFixed(0)} off your next etc. invoice. - etc.`;
  },
  // To someone on the team (not a client): their day changed. Built at send time; never prices.
  "sms.crew_assignment": async (p: { userId: string; date: string }, ctx: Ctx) => {
    const day = await dayLines(ctx.businessId, p.userId, p.date);
    const first = day.stops[0] ?? day.tasks[0];
    return `etc. crew: your work for ${prettyDate(p.date)} was updated (${dayCount(day)}). ${env.appUrl}/run?date=${p.date}${first ? ` First: ${first}` : ""}`;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- no props, but enqueueSms needs a props type
  "sms.opt_in": async (_p: Record<string, never>) => "You're signed up for etc. booking texts. Reply STOP to stop, HELP for help.",
} satisfies Record<string, (p: never, ctx: Ctx) => Promise<string>>;

export type SmsTemplateName = keyof typeof smsTemplates;
