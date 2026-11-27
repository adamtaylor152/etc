// What a completed visit costs. Pure, unit-tested. Prices include tax (not GST-registered).
import type { JobKind, SnowBillingMode } from "@/generated/prisma/client";

export type ChargeLine = { name: string; quantity: number; unitPriceCents: number; totalCents: number };

type JobForCharges = {
  kind: JobKind; billingType: "FIXED_PRICE" | "PER_VISIT"; snowBillingMode: SnowBillingMode | null;
  pricePerPushCents: number | null; iceMelt: boolean;
  lineItems: { name: string; quantity: number; unitPriceCents: number; perVisit: boolean }[];
};
type VisitForCharges = { pushNumber: number | null; iceMeltApplied: boolean | null };

const line = (name: string, unitPriceCents: number, quantity = 1): ChargeLine =>
  ({ name, quantity, unitPriceCents, totalCents: Math.round(quantity * unitPriceCents) });

export function chargesForVisit(job: JobForCharges, visit: VisitForCharges, iceMeltCents: number): ChargeLine[] {
  if (job.kind === "SNOW_PLAN") {
    const mode = job.snowBillingMode ?? "PER_PUSH";
    if (mode === "SEASONAL") return []; // billed once for the season
    if (mode === "PER_EVENT" && (visit.pushNumber ?? 1) > 1) return []; // one charge per storm
    const out = [line(mode === "PER_EVENT" ? "Snow clearing (storm)" : "Snow clearing (per push)", job.pricePerPushCents ?? 3000)];
    if (visit.iceMeltApplied ?? job.iceMelt) out.push(line("Ice melt", iceMeltCents));
    return out;
  }
  if (job.billingType === "FIXED_PRICE") return []; // invoiced from the job total, not per visit
  return job.lineItems
    .filter((l) => l.perVisit && (l.name !== "Ice melt" || visit.iceMeltApplied !== false))
    .map((l) => line(l.name, l.unitPriceCents, l.quantity));
}
