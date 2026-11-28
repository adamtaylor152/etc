// What a completed visit charges, written to the database. One place builds it, so completing a visit, reopening a
// sibling push of the same storm, and changing a storm's measured depth all price the same way.
import { chargesForVisit, parseOverrides, STORM_CHARGE } from "../billing/charges";
import type { Tx } from "../db";

export async function iceMeltPrice(tx: Tx, businessId: string) {
  const s = await tx.service.findUnique({ where: { businessId_key: { businessId, key: "ice_melt" } } });
  return s?.unitPriceCents ?? 500;
}

/**
 * Rebuild a completed visit's un-invoiced charges from scratch (so doing it twice never double-bills). Returns the
 * lines it wrote, or null when there is nothing to do: the visit isn't done, or its charges are already on an invoice.
 */
export async function rebuildCharges(tx: Tx, visitId: string) {
  const v = await tx.visit.findUniqueOrThrow({
    where: { id: visitId },
    include: { job: { include: { lineItems: true } }, charges: true, snowEvent: { select: { measuredCm: true } } },
  });
  if (v.state !== "COMPLETED" || v.charges.some((c) => c.invoiceLineItemId)) return null;
  await tx.visitCharge.deleteMany({ where: { visitId, invoiceLineItemId: null } });
  const job = { ...v.job, lineItems: v.job.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity) })) };
  // Per storm: the clearing is charged once, on one push. startsWith: a depth tier adds to the name.
  const stormCharged = v.job.snowBillingMode === "PER_EVENT" && !!v.snowEventId
    && (await tx.visitCharge.count({ where: { name: { startsWith: STORM_CHARGE }, visit: { jobId: v.jobId, snowEventId: v.snowEventId, id: { not: visitId } } } })) > 0;
  // Read inside the caller's transaction, after it locked the visit row: an extra the client is adding right now is either in or refused.
  const extras = await tx.visitExtra.findMany({ where: { visitId }, orderBy: { createdAt: "asc" } });
  const lines = chargesForVisit(job, {
    iceMeltApplied: v.iceMeltApplied, stormCharged, overrides: parseOverrides(v.lineOverrides),
    depthCm: v.depthCm ?? v.snowEvent?.measuredCm ?? null, // depth for the tier: what the crew measured here, else the storm's
    isReturn: v.isReturn, returnPriceCents: v.returnPriceCents,
  }, await iceMeltPrice(tx, v.businessId), extras);
  if (lines.length) await tx.visitCharge.createMany({ data: lines.map((l) => ({ ...l, businessId: v.businessId, visitId })) });
  return lines;
}

/**
 * Re-price every completed, not-yet-invoiced visit of a storm, oldest first. Called when the storm's measured depth
 * changes (depth tiers) and when a push that carried the once-per-storm charge is reopened or cancelled (the charge
 * must land on another completed push, not vanish).
 */
export async function rebuildStormCharges(tx: Tx, snowEventId: string, jobId?: string) {
  const done = await tx.visit.findMany({ where: { snowEventId, state: "COMPLETED", ...(jobId ? { jobId } : {}) }, orderBy: { completedAt: "asc" }, select: { id: true } });
  for (const v of done) await rebuildCharges(tx, v.id);
}
