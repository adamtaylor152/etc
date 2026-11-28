// Text message bodies. Short, plain, signed "- etc." Links are minted at send time (no raw tokens stored).
import { db } from "../db";
import { env } from "../env";
import { routeEnds } from "../routing";
import { travelMatrix } from "../routing-matrix";
import { etaWindow } from "../routing/eta";
import { mintToken } from "../tokens";
import { dollars } from "../ops/drive-size";

type Ctx = { businessId: string };
const first = (n: string) => n.trim().split(" ")[0] || "there";

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
    return `Hi ${first(v.job.client.firstName)}, the etc. crew is on the way to ${v.property.formatted.split(",")[0]}${await arrival(v)}. No need to be home. - etc. (Reply STOP to opt out)`;
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
    return `Hi ${first(v.job.client.firstName)}, etc. is booked for ${v.property.formatted.split(",")[0]} tomorrow. Confirm or change: ${env.appUrl}/c/${raw} - etc.`;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- no props, but enqueueSms needs a props type
  "sms.opt_in": async (_p: Record<string, never>) => "You're signed up for etc. booking texts. Reply STOP to stop, HELP for help.",
} satisfies Record<string, (p: never, ctx: Ctx) => Promise<string>>;

export type SmsTemplateName = keyof typeof smsTemplates;
