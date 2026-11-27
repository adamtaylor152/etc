// Small shared helpers used inside transactions: sequential numbers and the activity timeline.
import type { ActorType, CounterKind, Prisma } from "@/generated/prisma/client";
import type { Db } from "./db";

/** Next number for requests/quotes/jobs/invoices. Row lock via upsert-increment, so concurrent calls never collide. */
export async function nextNumber(tx: Db, businessId: string, kind: CounterKind): Promise<number> {
  const rows = await tx.$queryRaw<{ next: number }[]>`
    INSERT INTO "Counter" ("businessId", kind, next) VALUES (${businessId}, ${kind}::"CounterKind", 2)
    ON CONFLICT ("businessId", kind) DO UPDATE SET next = "Counter".next + 1
    RETURNING next - 1 AS next`;
  return Number(rows[0].next);
}

export async function logActivity(tx: Db, e: {
  businessId: string; type: string; entityType: string; entityId: string;
  actorType?: ActorType; actorUserId?: string; actorClientId?: string;
  clientId?: string; jobId?: string; snowEventId?: string; data?: Prisma.InputJsonValue;
}) {
  await tx.activityEvent.create({ data: { actorType: "SYSTEM", data: {}, ...e } });
}
