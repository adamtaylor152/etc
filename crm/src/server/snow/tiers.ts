// Snow-plan money rules that depend on the storm: depth tiers on one plan (instead of a job per depth) and the
// return-visit price. Pure, unit-tested.
import { TransitionError } from "../status/visit";

/** Snow deeper than `overCm` adds `addCents` to the plan's clearing price. The deepest tier that applies wins (they don't stack). */
export type DepthTier = { overCm: number; addCents: number };
export const MAX_TIERS = 4;

/** Read Job.depthTiers / the settings default defensively: anything malformed counts as "no tiers" (today's flat price). */
export function parseTiers(json: unknown): DepthTier[] {
  if (!Array.isArray(json) || !json.length || json.length > MAX_TIERS) return [];
  const ok = json.every((t) => !!t && Number.isInteger(t.overCm) && t.overCm > 0 && Number.isInteger(t.addCents) && t.addCents >= 0);
  if (!ok) return [];
  const tiers = json.map((t) => ({ overCm: t.overCm as number, addCents: t.addCents as number })).sort((a, b) => a.overCm - b.overCm);
  return tiers.every((t, i) => !i || t.overCm > tiers[i - 1].overCm) ? tiers : [];
}

/** The tier rows of a form ("over __ cm: +$__"); blank rows are dropped. Throws on anything that isn't a clean rising list. */
export function tiersFromRows(cms: string[], adds: string[]): DepthTier[] {
  const rows = cms.map((cm, i) => [cm.trim(), (adds[i] ?? "").trim()]).filter(([cm, add]) => cm || add);
  const tiers = rows.map(([cm, add]) => ({ overCm: Number(cm), addCents: Math.round(Number(add || 0) * 100) }));
  if (tiers.length && parseTiers(tiers).length !== tiers.length) throw new TransitionError("Depth tiers need a depth in whole cm and an amount, each deeper than the one before");
  return parseTiers(tiers);
}

/** Every band of a tier list, base first: "up to 10 cm" (+0), "11–20 cm", "over 20 cm". Depths are whole centimetres. */
export function tierBands(tiers: DepthTier[]): { label: string; addCents: number }[] {
  if (!tiers.length) return [];
  return [
    { label: `up to ${tiers[0].overCm} cm`, addCents: 0 },
    ...tiers.map((t, i) => ({ label: tiers[i + 1] ? `${t.overCm + 1}–${tiers[i + 1].overCm} cm` : `over ${t.overCm} cm`, addCents: t.addCents })),
  ];
}

/** The band a depth falls in. A depth exactly on a threshold stays in the lower band ("up to 10 cm" includes 10).
 *  null = no tiers, or nobody measured the snow: the plain price, as before tiers existed. */
export function tierFor(tiers: DepthTier[], depthCm: number | null | undefined) {
  if (!tiers.length || depthCm == null) return null;
  return tierBands(tiers)[tiers.filter((t) => depthCm > t.overCm).length];
}

/** "up to 10 cm $30 · 11–20 cm $45 · over 20 cm $60" for plan cards. */
export const describeTiers = (tiers: DepthTier[], baseCents: number, money: (cents: number) => string) =>
  tierBands(tiers).map((b) => `${b.label} ${money(baseCents + b.addCents)}`).join(" · ");

/** A billable return visit costs this share of the plan's base clearing price (Settings › Snow; the tier doesn't apply). */
export const returnVisitPrice = (baseCents: number, pct: number) => Math.round((baseCents * pct) / 100);
