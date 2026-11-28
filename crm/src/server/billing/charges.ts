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

/** A one-off add-on the client put on this visit (VisitExtra). */
export type ExtraForCharges = { serviceKey: string; name: string; unitPriceCents: number };
const ICE_MELT = "ice_melt";

export function chargesForVisit(job: JobForCharges, visit: VisitForCharges, iceMeltCents: number, extras: ExtraForCharges[] = []): ChargeLine[] {
  const out = jobCharges(job, visit, iceMeltCents);
  // Extras are billed with the visit they were added to, on top of whatever the job charges. Never twice: one the job
  // already charged on this visit is dropped, and ice melt the crew said they didn't put down isn't billed at all.
  for (const e of extras) {
    const iceMelt = e.serviceKey === ICE_MELT;
    if (out.some((l) => l.name === e.name || (iceMelt && l.name === "Ice melt")) || (iceMelt && visit.iceMeltApplied === false)) continue;
    out.push(line(e.name, e.unitPriceCents));
  }
  return out;
}

function jobCharges(job: JobForCharges, visit: VisitForCharges, iceMeltCents: number): ChargeLine[] {
  if (job.kind === "SNOW_PLAN") {
    const mode = job.snowBillingMode ?? "PER_PUSH";
    if (mode === "SEASONAL") return []; // billed once for the season
    if (mode === "PER_EVENT" && (visit.pushNumber ?? 1) > 1) return []; // one charge per storm
    const out = [line(mode === "PER_EVENT" ? "Snow clearing (storm)" : "Snow clearing (per push)", job.pricePerPushCents ?? 3000)];
    // The plan's extra-sidewalk line (from booking, the size check or the client hub) is charged with each clearing.
    for (const l of job.lineItems) if (l.perVisit && l.name.startsWith("Extra sidewalk")) out.push(line(l.name, l.unitPriceCents, l.quantity));
    if (visit.iceMeltApplied ?? job.iceMelt) out.push(line("Ice melt", iceMeltCents));
    return out;
  }
  if (job.billingType === "FIXED_PRICE") return []; // invoiced from the job total, not per visit
  return job.lineItems
    .filter((l) => l.perVisit && (l.name !== "Ice melt" || visit.iceMeltApplied !== false))
    .map((l) => line(l.name, l.unitPriceCents, l.quantity));
}

/** Add-ons a client may still put on a visit: ones the job doesn't already charge and the visit doesn't already have. */
export function extrasOffered<T extends { key: string; name: string }>(
  addOns: T[], job: { billingType: "FIXED_PRICE" | "PER_VISIT"; iceMelt: boolean; lineItems: { name: string }[] }, has: { serviceKey: string }[],
): T[] {
  if (job.billingType !== "PER_VISIT") return []; // a fixed-price job is invoiced from its total, so an extra would never be billed
  const charged = (name: string) => job.lineItems.some((l) => l.name === name);
  return addOns.filter((a) => !has.some((h) => h.serviceKey === a.key) && !charged(a.name) && !(a.key === ICE_MELT && (job.iceMelt || charged("Ice melt"))));
}
