// What a completed visit costs. Pure, unit-tested. Prices include tax (not GST-registered).
import type { JobKind, SnowBillingMode } from "@/generated/prisma/client";
import { parseTiers, tierFor } from "../snow/tiers";

export type ChargeLine = { name: string; quantity: number; unitPriceCents: number; totalCents: number };

type JobForCharges = {
  kind: JobKind; billingType: "FIXED_PRICE" | "PER_VISIT"; snowBillingMode: SnowBillingMode | null;
  pricePerPushCents: number | null; iceMelt: boolean; addonsIncluded: boolean;
  lineItems: { name: string; quantity: number; unitPriceCents: number; perVisit: boolean }[];
  depthTiers?: unknown; // Job.depthTiers (JSON); none = flat price
};
/** stormCharged: another visit of this plan in the same storm already carries the storm charge.
 *  depthCm: the snow this clearing is priced for (the crew's own measurement, else the storm's); picks the depth tier.
 *  isReturn: a return visit bills only its own price (returnPriceCents; none = included), never another clearing. */
type VisitForCharges = {
  iceMeltApplied: boolean | null; stormCharged?: boolean; overrides?: OverrideLine[] | null;
  depthCm?: number | null; isReturn?: boolean; returnPriceCents?: number | null;
};
/** This visit only (Visit.lineOverrides): charged instead of the job's per-visit lines. */
export type OverrideLine = { name: string; description?: string; quantity: number; unitPriceCents: number };
export const STORM_CHARGE = "Snow clearing (storm)"; // with depth tiers the name carries on: "Snow clearing (storm), 11–20 cm"
export const RETURN_CHARGE = "Return visit";
export const WALK_PREFIX = "Extra sidewalk"; // the job line booking and the size check add for a corner lot / long walk

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
  if (visit.isReturn) {
    // Ice melt only if the crew said they put some down this time, and never on a season price that covers it.
    const melt = visit.iceMeltApplied && !(job.snowBillingMode === "SEASONAL" && job.addonsIncluded) ? [line("Ice melt", iceMeltCents)] : [];
    return [...(visit.returnPriceCents ? [line(RETURN_CHARGE, visit.returnPriceCents)] : []), ...melt];
  }
  if (job.kind === "SNOW_PLAN") {
    const mode = job.snowBillingMode ?? "PER_PUSH";
    const melt = (visit.iceMeltApplied ?? job.iceMelt) ? [line("Ice melt", iceMeltCents)] : [];
    if (mode === "SEASONAL") return job.addonsIncluded ? [] : melt; // clearing (sidewalk included) is billed by instalments of the season price
    // The extra sidewalk the client was quoted (corner lot / long walk) is part of every clearing they pay for.
    const walk = job.lineItems.filter((l) => l.name.startsWith(WALK_PREFIX)).map((l) => line(l.name, l.unitPriceCents, l.quantity));
    // Per event: one clearing charge per storm, on whichever push is done first (push 1 may have been skipped).
    // Depth tiers: deeper snow adds to the clearing price, and the charge says which band it was.
    const tier = tierFor(parseTiers(job.depthTiers), visit.depthCm);
    const clearing = (name: string) => line(tier ? `${name}, ${tier.label}` : name, (job.pricePerPushCents ?? 3000) + (tier?.addCents ?? 0));
    if (mode === "PER_EVENT") return [...(visit.stormCharged ? [] : [clearing(STORM_CHARGE), ...walk]), ...melt];
    return [clearing("Snow clearing (per push)"), ...walk, ...melt];
  }
  if (job.billingType === "FIXED_PRICE") return []; // invoiced from the job total (once, or once a month when recurring), not per visit
  if (visit.overrides?.length) return visit.overrides.map((l) => line(l.name, l.unitPriceCents, l.quantity));
  return job.lineItems
    .filter((l) => l.perVisit && (l.name !== "Ice melt" || visit.iceMeltApplied !== false))
    .map((l) => line(l.name, l.unitPriceCents, l.quantity));
}

/** Read Visit.lineOverrides (JSON) defensively: anything malformed counts as "no override". */
export function parseOverrides(json: unknown): OverrideLine[] | null {
  if (!Array.isArray(json) || !json.length) return null;
  const ok = json.every((l) => !!l && typeof l.name === "string" && Number.isFinite(l.quantity) && Number.isInteger(l.unitPriceCents));
  return ok ? (json as OverrideLine[]) : null;
}

/** Add-ons a client may still put on a visit: ones the job doesn't already charge and the visit doesn't already have. */
export function extrasOffered<T extends { key: string; name: string }>(
  addOns: T[], job: { billingType: "FIXED_PRICE" | "PER_VISIT"; iceMelt: boolean; lineItems: { name: string }[] }, has: { serviceKey: string }[],
): T[] {
  if (job.billingType !== "PER_VISIT") return []; // a fixed-price job is invoiced from its total, so an extra would never be billed
  const charged = (name: string) => job.lineItems.some((l) => l.name === name);
  return addOns.filter((a) => !has.some((h) => h.serviceKey === a.key) && !charged(a.name) && !(a.key === ICE_MELT && (job.iceMelt || charged("Ice melt"))));
}
