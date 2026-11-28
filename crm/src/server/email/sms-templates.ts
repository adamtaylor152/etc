// Text message bodies. Short, plain, signed "- etc." Links are minted at send time (no raw tokens stored).
import { db } from "../db";
import { env } from "../env";
import { mintToken } from "../tokens";

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
  "sms.referral_thanks": async (p: { clientId: string; cents: number }) => {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    return `Thanks for sending a neighbour our way, ${first(c.firstName)}! $${(p.cents / 100).toFixed(0)} off your next etc. invoice. - etc.`;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- no props, but enqueueSms needs a props type
  "sms.opt_in": async (_p: Record<string, never>) => "You're signed up for etc. booking texts. Reply STOP to stop, HELP for help.",
} satisfies Record<string, (p: never, ctx: Ctx) => Promise<string>>;

export type SmsTemplateName = keyof typeof smsTemplates;
