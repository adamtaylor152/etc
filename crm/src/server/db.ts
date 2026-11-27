import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
if (process.env.NODE_ENV !== "production") g.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
export type Db = typeof db | Tx;

// ponytail: single-tenant today. Every query passes businessId explicitly; a $extends that injects it
// automatically is the upgrade when a second business exists.
let cached: { id: string; at: number } | null = null;
export async function businessId(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.id;
  const b = await db.business.findUniqueOrThrow({ where: { slug: env.businessSlug }, select: { id: true } });
  cached = { id: b.id, at: Date.now() };
  return b.id;
}

export async function business() {
  return db.business.findUniqueOrThrow({ where: { id: await businessId() } });
}
