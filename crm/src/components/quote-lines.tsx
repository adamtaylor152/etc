// Quote line editor (plain form fields, indexed names). Shows existing lines plus a few blank rows.
import { inputCls } from "./ui";

type Line = { name: string; description?: string | null; quantity: number; unitPriceCents: number | null; isOptional: boolean; isSelected: boolean };

export function QuoteLinesEditor({ lines, suggestions = [] }: { lines: Line[]; suggestions?: string[] }) {
  const rows: Line[] = [...lines, ...Array.from({ length: Math.max(3, 6 - lines.length) }, () => ({ name: "", quantity: 1, unitPriceCents: null, isOptional: false, isSelected: true }))];
  return (
    <div>
      <datalist id="quote-services">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="hidden grid-cols-[1fr_4.5rem_6rem_5.5rem] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid">
        <span>Item</span><span>Qty</span><span>Price $</span><span>Optional</span>
      </div>
      <div className="space-y-2">
        {rows.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_4.5rem_6rem_5.5rem] sm:border-0 sm:p-0">
            <div className="space-y-1">
              <input name={`line_${i}_name`} defaultValue={l.name} list="quote-services" placeholder={i < lines.length ? "" : "Add an item"} className={inputCls} />
              <input name={`line_${i}_desc`} defaultValue={l.description ?? ""} placeholder="Details (optional)" className={`${inputCls} min-h-9 text-sm`} />
            </div>
            <input name={`line_${i}_qty`} type="number" step="0.25" min="0.25" defaultValue={l.quantity} className={inputCls} aria-label="Quantity" />
            <input name={`line_${i}_price`} type="number" step="0.01" min="0" defaultValue={l.unitPriceCents != null ? l.unitPriceCents / 100 : ""} className={inputCls} aria-label="Price" />
            <div className="col-span-3 flex items-center gap-3 text-sm sm:col-span-1 sm:flex-col sm:items-start sm:gap-1">
              <label className="flex items-center gap-1.5"><input type="checkbox" name={`line_${i}_optional`} defaultChecked={l.isOptional} className="size-4" /> optional</label>
              <label className="flex items-center gap-1.5 text-ink-soft"><input type="checkbox" name={`line_${i}_selected`} defaultChecked={l.isSelected} className="size-4" /> pre-ticked</label>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">Prices include tax. Optional items let the client add extras when approving (pre-ticked = recommended).</p>
    </div>
  );
}
