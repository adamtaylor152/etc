// Review requests 2.0 (rating first; happy clients go to Google, others to private feedback) and the referral program.
import { randomBytes } from "node:crypto";
import { db, type Tx } from "../db";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { clientName } from "../queries";
import { logActivity } from "../records";
import { parseSettings } from "../settings";
import { smsEnabled, toE164 } from "../sms";

/** 4–5 stars -> Google; 1–3 -> private feedback. Pure, unit-tested. */
export const reviewRoute = (rating: number) => (rating >= 4 ? "google" : "feedback");

/** Readable share code: first name letters + 4 random chars, e.g. JANE7K2Q. Pure-ish (random part), unit-tested for shape. */
export function makeReferralCode(firstName: string, rand = randomBytes(4)) {
  const base = firstName.normalize("NFKD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "ETC";
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return base + Array.from(rand).map((b) => alphabet[b % alphabet.length]).join("");
}

export async function referralCodeFor(clientId: string) {
  const c = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  if (c.referralCode) return c.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = makeReferralCode(c.firstName);
    const clash = await db.client.findFirst({ where: { businessId: c.businessId, referralCode: code } });
    if (!clash) return (await db.client.update({ where: { id: c.id }, data: { referralCode: code } })).referralCode!;
  }
  throw new Error("could not make a referral code");
}
export const referralLink = (code: string) => `${env.siteUrl}/book.html?ref=${encodeURIComponent(code)}`;

/** A booking came in with ?ref=CODE: link the new client to who sent them (never themselves, only once). */
export async function recordReferral(businessId: string, refereeId: string, code: string | null | undefined) {
  if (!code) return null;
  const referrer = await db.client.findFirst({ where: { businessId, referralCode: code.trim().toUpperCase() } });
  if (!referrer || referrer.id === refereeId) return null;
  const referee = await db.client.findUniqueOrThrow({ where: { id: refereeId } });
  if (referee.referredById || (await db.referral.findUnique({ where: { refereeId } }))) return null;
  await db.client.update({ where: { id: refereeId }, data: { referredById: referrer.id, leadSource: referee.leadSource ?? "Referral" } });
  const s = parseSettings((await db.business.findUniqueOrThrow({ where: { id: businessId } })).settings);
  const ref = await db.referral.create({ data: { businessId, referrerId: referrer.id, refereeId, rewardCents: s.referralRewardCents } });
  if (s.referralDiscountCents > 0) await db.clientCredit.create({ data: { businessId, clientId: refereeId, amountCents: s.referralDiscountCents, reason: `Welcome credit (referred by ${clientName(referrer)})`, referralId: ref.id } });
  return ref;
}

/** After a payment: the referred client's first paid invoice qualifies the referral and credits the referrer. */
export async function qualifyReferral(tx: Tx, clientId: string) {
  const ref = await tx.referral.findUnique({ where: { refereeId: clientId } });
  if (!ref || ref.status !== "PENDING") return;
  if (!(await tx.invoice.count({ where: { clientId, status: "PAID", kind: "STANDARD" } }))) return;
  await tx.referral.update({ where: { id: ref.id }, data: { status: "QUALIFIED", qualifiedAt: new Date() } });
  if (ref.rewardCents <= 0) return;
  const referee = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
  await tx.clientCredit.create({ data: { businessId: ref.businessId, clientId: ref.referrerId, amountCents: ref.rewardCents, reason: `Referral reward for ${clientName(referee)}`, referralId: ref.id } });
  const referrer = await tx.client.findUniqueOrThrow({ where: { id: ref.referrerId } });
  await logActivity(tx, { businessId: ref.businessId, type: "referral.rewarded", entityType: "Client", entityId: referrer.id, actorType: "SYSTEM", clientId: referrer.id, data: { amountCents: ref.rewardCents, referee: clientName(referee) } });
  if (smsEnabled() && referrer.smsOptIn && !referrer.smsOptOutAt && toE164(referrer.phone)) {
    await enqueueSms(tx, { businessId: ref.businessId, template: "sms.referral_thanks", client: referrer, props: { clientId: referrer.id, cents: ref.rewardCents }, dedupeKey: `referral:${ref.id}:thanks` });
  } else if (referrer.email) {
    await enqueue(tx, { businessId: ref.businessId, template: "owner.notice", to: referrer.email, replyTo: env.helpEmail, priority: 6, dedupeKey: `referral:${ref.id}:thanks-email`, clientId: referrer.id,
      props: { title: "Thanks for the referral!", body: `${clientName(referee)} booked with us. $${(ref.rewardCents / 100).toFixed(0)} comes off your next etc. invoice.`, path: "/" } });
  }
}

/** Scheduler: send "How did we do?" a set time after a visit is done, once per client per season. */
export async function sendReviewRequests() {
  for (const biz of await db.business.findMany()) {
    const s = parseSettings(biz.settings);
    if (!s.reviewRequests || !biz.googleReviewUrl) continue;
    const to = new Date(Date.now() - s.reviewDelayHours * 3_600_000), from = new Date(to.getTime() - 2 * 86_400_000);
    const done = await db.visit.findMany({ where: { businessId: biz.id, state: "COMPLETED", completedAt: { gte: from, lte: to } }, include: { job: { include: { client: true } } }, distinct: ["jobId"] });
    const seasonStart = new Date(Date.now() - 180 * 86_400_000);
    for (const v of done) {
      const c = v.job.client;
      if (c.marketingOptOut || c.archivedAt) continue;
      if (await db.reviewRequest.count({ where: { clientId: c.id, sentAt: { gte: seasonStart } } })) continue;
      const bySms = smsEnabled() && c.smsOptIn && !c.smsOptOutAt && !!toE164(c.phone);
      if (!bySms && (!c.email || c.emailBouncedAt)) continue;
      const rr = await db.reviewRequest.create({ data: { businessId: biz.id, clientId: c.id, jobId: v.jobId, channel: bySms ? "SMS" : "EMAIL" } });
      if (bySms) await enqueueSms(db, { businessId: biz.id, template: "sms.review_request", client: c, props: { clientId: c.id, reviewId: rr.id }, dedupeKey: `review:${rr.id}` });
      else await enqueue(db, { businessId: biz.id, template: "review.request", to: c.email, replyTo: env.helpEmail, priority: 8, props: { clientId: c.id, reviewId: rr.id }, dedupeKey: `review:${rr.id}`, clientId: c.id });
    }
  }
  kickOutbox();
}

/** Client tapped a star. Returns where to send them next. */
export async function rate(reviewId: string, rating: number) {
  const r = await db.reviewRequest.update({ where: { id: reviewId }, data: { rating: Math.max(1, Math.min(5, Math.round(rating))), ratedAt: new Date() } });
  await logActivity(db, { businessId: r.businessId, type: "review.rated", entityType: "Client", entityId: r.clientId, actorType: "CLIENT", actorClientId: r.clientId, clientId: r.clientId, data: { rating: r.rating } });
  return reviewRoute(r.rating!);
}

export async function leaveFeedback(reviewId: string, feedback: string) {
  const r = await db.reviewRequest.update({ where: { id: reviewId }, data: { feedback: feedback.trim().slice(0, 3000) } });
  const c = await db.client.findUniqueOrThrow({ where: { id: r.clientId } });
  await db.note.create({ data: { businessId: r.businessId, body: `Private feedback (${r.rating}★): ${r.feedback}`, clientId: c.id, pinned: true, linkDownstream: false } });
  for (const to of env.ownerEmails) await enqueue(db, { businessId: r.businessId, template: "owner.notice", to, priority: 2, props: { title: `${r.rating}★ feedback from ${clientName(c)}`, body: r.feedback ?? "", path: `/clients/${c.id}` } });
  kickOutbox();
}
