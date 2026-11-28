// Depth tiers of a snow plan (snow/tiers.ts): "over __ cm: +$__" rows, read by tiersFromRows. Plain inputs, no JS.
import { MAX_TIERS, type DepthTier } from "@/server/snow/tiers";

export function DepthTierFields({ tiers, hint }: { tiers: DepthTier[]; hint?: string }) {
  return (
    <fieldset className="rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-bold">Deeper snow costs more (optional)</legend>
      <input type="hidden" name="tiersShown" value="1" />
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: MAX_TIERS }, (_, i) => tiers[i]).map((t, i) => (
          <span key={i} className="flex items-center gap-2 text-sm">
            Over <input name="tierCm" type="number" min={1} max={300} step={1} defaultValue={t?.overCm ?? ""} aria-label={`Tier ${i + 1}: over how many cm`} className="h-9 w-20 rounded-lg border border-line px-2" /> cm: +$
            <input name="tierAdd" type="number" min={0} step="0.01" defaultValue={t ? t.addCents / 100 : ""} aria-label={`Tier ${i + 1}: extra dollars`} className="h-9 w-24 rounded-lg border border-line px-2" />
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{hint ?? "Added to the per push / per storm price when the snow is deeper than that (the depth entered on the visit, else the storm's). The deepest row that applies is used. Blank = one flat price. A seasonal price ignores these."}</p>
    </fieldset>
  );
}
