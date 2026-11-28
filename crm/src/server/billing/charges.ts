// What a completed visit costs. Pure, unit-tested. Prices include tax (not GST-registered).
import type { JobKind, SnowBillingMode } from "@/generated/prisma/client";

export type ChargeLine = { name: string; quantity: number; unitPriceCents: number; totalCents: number };

type JobForCharges = {
  kind: JobKind; billingType: "FIXED_PRICE" | "PER_VISIT"; snowBillingMode: SnowBillingMode | null;
  pricePerPushCents: number | null; iceMelt: boolean; addonsIncluded: boolean;
  lineItems: { name: string; quantity: number; unitPriceCents: number; perVisit: boolean }[];
};
/** stormCharged: another visit of this plan in the same storm already carries the storm charge. */
type VisitForCharges = { iceMeltApplied: boolean | null; stormCharged?: boolean };
export const STORM_CHARGE = "Snow clearing (storm)";

const line = (name: string, unitPriceCents: number, quantity = 1): ChargeLine =>
  ({ name, quantity, unitPriceCents, totalCents: Math.round(quantity * unitPriceCents) });

export function chargesForVisit(job: JobForCharges, visit: VisitForCharges, iceMeltCents: number): ChargeLine[] {
  if (job.kind === "SNOW_PLAN") {
    const mode = job.snowBillingMode ?? "PER_PUSH";
    const melt = (visit.iceMeltApplied ?? job.iceMelt) ? [line("Ice melt", iceMeltCents)] : [];
    if (mode === "SEASONAL") return job.addonsIncluded ? [] : melt; // clearing is billed by instalments of the season price
    // Per event: one clearing charge per storm, on whichever push is done first (push 1 may have been skipped).
    if (mode === "PER_EVENT") return [...(visit.stormCharged ? [] : [line(STORM_CHARGE, job.pricePerPushCents ?? 3000)]), ...melt];
    return [line("Snow clearing (per push)", job.pricePerPushCents ?? 3000), ...melt];
  }
  if (job.billingType === "FIXED_PRICE") return []; // invoiced from the job total, not per visit
  return job.lineItems
    .filter((l) => l.perVisit && (l.name !== "Ice melt" || visit.iceMeltApplied !== false))
    .map((l) => line(l.name, l.unitPriceCents, l.quantity));
}
