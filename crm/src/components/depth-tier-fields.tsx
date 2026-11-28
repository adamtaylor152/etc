// Depth tiers of a snow plan (snow/tiers.ts): "over __ cm: +$__" rows, read by tiersFromRows. Plain inputs, no JS.
import { inputCls } from "@/components/ui";
import { MAX_TIERS, type DepthTier } from "@/server/snow/tiers";

export function DepthTierFields({ tiers, hint }: { tiers: DepthTier[]; hint?: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-sm font-semibold">Deeper snow costs more (optional)</legend>
      <input type="hidden" name="tiersShown" value="1" />
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: MAX_TIERS }, (_, i) => tiers[i]).map((t, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0">Over</span><input name="tierCm" type="number" min={1} max={300} step={1} defaultValue={t?.overCm ?? ""} aria-label={`Tier ${i + 1}: over how many cm`} className={`${inputCls} min-w-0 flex-1 tabular-nums`} /><span className="shrink-0 whitespace-nowrap">cm: +$</span>
            <input name="tierAdd" type="number" min={0} step="0.01" defaultValue={t ? t.addCents / 100 : ""} aria-label={`Tier ${i + 1}: extra dollars`} className={`${inputCls} min-w-0 flex-1 tabular-nums`} />
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{hint ?? "Added to the per push / per storm price when the snow is deeper than that (the depth entered on the visit, else the storm's). The deepest row that applies is used. Blank = one flat price. A seasonal price ignores these."}</p>
    </fieldset>
  );
}
