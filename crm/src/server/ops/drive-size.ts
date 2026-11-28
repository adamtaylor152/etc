// Driveway size pricing for snow shovelling. Clients pick a size when booking; an owner checks it on the satellite view
// before the first visit. Smaller or same: price applied. Bigger: the job is held and the client gets a link to OK the
// new price (or cancel). Oversized: held until someone sends a quote.
import { Prisma, type DriveSize } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { enqueue, enqueueSms, kickOutbox } from "../email/outbox";
import { env } from "../env";
import { clientName } from "../queries";
import { logActivity } from "../records";

type Actor = { id: string; businessId: string };
export const SIZES: Record<DriveSize, { label: string; short: string }> = {
  STANDARD: { label: "Standard (1–2 car, normal walk)", short: "Standard" },
  LARGE: { label: "Large (3 car, long or wide)", short: "Large" },
  OVERSIZED: { label: "Oversized (acreage, lane, commercial)", short: "Oversized" },
};
/** "$45" or "$45.50" (prices include tax). */
export const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
export const sizeFromLabel = (s: unknown): DriveSize => (s === "Large" ? "LARGE" : s === "Oversized" ? "OVERSIZED" : "STANDARD");

export type SnowPrices = { once: Record<"STANDARD" | "LARGE", number>; push: Record<"STANDARD" | "LARGE", number>; walk: number };
export async function snowPrices(tx: Tx | typeof db, businessId: string): Promise<SnowPrices> {
  const rows = await tx.service.findMany({ where: { businessId, key: { in: ["snow_once", "snow_once_large", "snow_plan_push", "snow_plan_push_large", "extra_walk"] } } });
  const p = (k: string, fallback: number) => rows.find((r) => r.key === k)?.unitPriceCents ?? fallback;
  return { once: { STANDARD: p("snow_once", 3500), LARGE: p("snow_once_large", 5000) }, push: { STANDARD: p("snow_plan_push", 3000), LARGE: p("snow_plan_push_large", 4500) }, walk: p("extra_walk", 1000) };
}

/** Price for a size (null = oversized, needs a quote). Pure. */
export function snowCharge(prices: SnowPrices, plan: boolean, size: DriveSize, extraWalk: boolean) {
  if (size === "OVERSIZED") return null;
  return { base: (plan ? prices.push : prices.once)[size], walk: extraWalk ? prices.walk : 0 };
}

const isBase = (name: string) => name.startsWith("Snow shovelling");
const isWalk = (name: string) => name.startsWith("Extra sidewalk");
export const BASE_NAME = { plan: { STANDARD: "Snow shovelling, every snowfall (per push)", LARGE: "Snow shovelling, every snowfall, large driveway (per push)" }, once: { STANDARD: "Snow shovelling (one-time)", LARGE: "Snow shovelling (one-time), large driveway" } };
export const WALK_NAME = "Extra sidewalk (corner lot / long walk)";

/** What the job charges per visit now (base + extra sidewalk lines). */
export function currentCharge(lines: { name: string; unitPriceCents: number }[]) {
  return { base: lines.find((l) => isBase(l.name))?.unitPriceCents ?? 0, walk: lines.find((l) => isWalk(l.name))?.unitPriceCents ?? 0 };
}

async function applyCharge(tx: Tx, job: { id: string; kind: string }, size: "STANDARD" | "LARGE", c: { base: number; walk: number }) {
  const plan = job.kind === "SNOW_PLAN";
  const lines = await tx.jobLineItem.findMany({ where: { jobId: job.id } });
  const base = lines.find((l) => isBase(l.name));
  const name = (plan ? BASE_NAME.plan : BASE_NAME.once)[size];
  if (base) await tx.jobLineItem.update({ where: { id: base.id }, data: { name, unitPriceCents: c.base, totalCents: c.base, quantity: 1 } });
  else await tx.jobLineItem.create({ data: { jobId: job.id, name, unitPriceCents: c.base, totalCents: c.base, perVisit: true } });
  const walk = lines.find((l) => isWalk(l.name));
  if (c.walk && walk) await tx.jobLineItem.update({ where: { id: walk.id }, data: { unitPriceCents: c.walk, totalCents: c.walk } });
  else if (c.walk) await tx.jobLineItem.create({ data: { jobId: job.id, name: WALK_NAME, unitPriceCents: c.walk, totalCents: c.walk, perVisit: true, sortOrder: 2 } });
  else if (walk) await tx.jobLineItem.delete({ where: { id: walk.id } });
  await tx.job.update({ where: { id: job.id }, data: { ...(plan ? { pricePerPushCents: c.base } : {}), sizeHoldAt: null, pendingPrice: Prisma.DbNull } });
}

export const openSnowJobs = (businessId: string, propertyId: string) => ({
  businessId, propertyId, closedAt: null, OR: [{ kind: "SNOW_PLAN" as const }, { kind: "ONE_OFF" as const, title: { startsWith: "Snow" } }],
});

export type Pending = { size: DriveSize; extraWalk: boolean; base: number; walk: number; quote?: boolean };

/** Owner confirmed the size from the satellite view. Returns what happened to each open snow job. */
export async function confirmSize(user: Actor, propertyId: string, size: DriveSize, extraWalk: boolean) {
  const prices = await snowPrices(db, user.businessId);
  const out: ("applied" | "asked" | "quote")[] = [];
  await db.$transaction(async (tx) => {
    const prop = await tx.property.update({ where: { id: propertyId, businessId: user.businessId }, data: { driveSize: size, extraWalk, sizeCheckedAt: new Date() }, include: { client: true } });
    const jobs = await tx.job.findMany({ where: openSnowJobs(user.businessId, propertyId), include: { lineItems: true } });
    for (const job of jobs) {
      const next = snowCharge(prices, job.kind === "SNOW_PLAN", size, extraWalk);
      if (!next) {
        await tx.job.update({ where: { id: job.id }, data: { sizeHoldAt: new Date(), pendingPrice: { size, extraWalk, base: 0, walk: 0, quote: true } satisfies Pending as unknown as Prisma.InputJsonValue } });
        out.push("quote");
        continue;
      }
      const now = currentCharge(job.lineItems);
      if (next.base + next.walk <= now.base + now.walk) { await applyCharge(tx, job, size as "STANDARD" | "LARGE", next); out.push("applied"); continue; }
      await tx.job.update({ where: { id: job.id }, data: { sizeHoldAt: new Date(), pendingPrice: { size, extraWalk, ...next } satisfies Pending as unknown as Prisma.InputJsonValue } });
      if (prop.client.email && !prop.client.emailBouncedAt) {
        await enqueue(tx, { businessId: user.businessId, template: "price.change", to: prop.client.email, replyTo: env.helpEmail, priority: 2, props: { jobId: job.id }, dedupeKey: `price-change:${job.id}:${next.base + next.walk}`, clientId: prop.clientId, entityType: "Job", entityId: job.id });
      }
      if (prop.client.smsOptIn && prop.client.phone) await enqueueSms(tx, { businessId: user.businessId, template: "sms.price_change", client: prop.client, props: { jobId: job.id }, dedupeKey: `price-change-sms:${job.id}:${next.base + next.walk}` });
      await logActivity(tx, { businessId: user.businessId, type: "job.price_change_sent", entityType: "Job", entityId: job.id, actorType: "USER", actorUserId: user.id, clientId: job.clientId, jobId: job.id, data: { size, cents: next.base + next.walk } });
      out.push("asked");
    }
  });
  kickOutbox();
  return out;
}

/** The client's answer from the price-change page. */
export async function answerPrice(jobId: string, yes: boolean) {
  await db.$transaction(async (tx) => {
    const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, include: { client: true } });
    const p = job.pendingPrice as unknown as Pending | null;
    if (!job.sizeHoldAt || !p || p.quote) return;
    if (yes) await applyCharge(tx, job, p.size as "STANDARD" | "LARGE", p);
    else {
      await tx.job.update({ where: { id: job.id }, data: { closedAt: new Date(), sizeHoldAt: null, pendingPrice: Prisma.DbNull } });
      await tx.visit.updateMany({ where: { jobId: job.id, state: "SCHEDULED" }, data: { state: "CANCELLED" } });
    }
    await logActivity(tx, { businessId: job.businessId, type: yes ? "job.price_accepted" : "job.price_declined", entityType: "Job", entityId: job.id, actorType: "CLIENT", actorClientId: job.clientId, clientId: job.clientId, jobId: job.id });
    for (const to of env.ownerEmails) {
      await enqueue(tx, { businessId: job.businessId, template: "owner.notice", to, priority: 2, dedupeKey: `price-answer:${job.id}:${yes}`, props: {
        title: `${clientName(job.client)} ${yes ? "accepted" : "declined"} the new snow price`,
        body: yes ? `$${((p.base + p.walk) / 100).toFixed(2)} per visit. Back on the route.` : "The snow job was closed and its scheduled visits cancelled.", path: `/jobs/${job.id}`,
      } });
    }
  });
  kickOutbox();
}
