"use client";
// Line items with a price-book picker: pick a service to fill the name, description + price, or type your own. Live totals.
// Posts lineName[] / lineDesc[] / lineQty[] / linePrice[] (dollars); with `dated`, also lineId[] (existing rows) / lineDate[].
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export type Service = { id: string; name: string; description?: string | null; unitPriceCents: number | null };
type Row = { name: string; desc: string; qty: string; price: string; id?: string; date?: string; note?: string };
const blank: Row = { name: "", desc: "", qty: "1", price: "" };
const inp = "min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-blue";
const fmt = (c: number) => (c / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export function LineItems({ services, initial = [], label = "Line items", dated = false }: { services: Service[]; initial?: Partial<Row>[]; label?: string; dated?: boolean }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial.map((r) => ({ ...blank, ...r })) : [{ ...blank }]);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((n, r) => n + Math.round((Number(r.qty) || 0) * (Number(r.price) || 0) * 100), 0);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-sm font-semibold">{label}</span><span className="text-xs text-ink-soft">Prices include tax</span></div>
      <div className="hidden grid-cols-[1fr_4.5rem_6.5rem_6rem_2rem] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid"><span>Product / service</span><span>Qty</span><span>Unit price</span><span className="text-right">Total</span><span /></div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_4.5rem_6.5rem_6rem_2rem] sm:border-0 sm:p-0">
            <div className="space-y-1">
              <div className="flex gap-1">
                <select aria-label="Pick from price book" value="" onChange={(e) => { const s = services.find((x) => x.id === e.target.value); if (s) set(i, { name: s.name, desc: s.description ?? r.desc, price: s.unitPriceCents != null ? String(s.unitPriceCents / 100) : r.price }); }}
                  className="min-h-10 w-10 shrink-0 rounded-lg border border-line bg-tint px-1 text-xs" title="Price book">
                  <option value="">📋</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.unitPriceCents != null ? ` · ${fmt(s.unitPriceCents)}` : ""}</option>)}
                </select>
                <input name="lineName" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Item name" aria-label="Item name" className={inp} />
              </div>
              <input name="lineDesc" value={r.desc} onChange={(e) => set(i, { desc: e.target.value })} placeholder="Description (optional)" aria-label="Description" className={`${inp} min-h-8 text-xs`} />
              {dated && <><input type="hidden" name="lineId" value={r.id ?? ""} /><input name="lineDate" type="date" value={r.date ?? ""} onChange={(e) => set(i, { date: e.target.value })} aria-label="Service date" className={`${inp} min-h-8 text-xs sm:w-40`} /></>}
              {r.note && <p className="text-xs text-ink-soft">{r.note}</p>}
            </div>
            <input name="lineQty" type="number" step="0.25" min="0" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" className={inp} />
            <input name="linePrice" type="number" step="0.01" min="0" value={r.price} onChange={(e) => set(i, { price: e.target.value })} placeholder="$" aria-label="Unit price" className={inp} />
            <span className="hidden self-center text-right text-sm font-semibold sm:block">{fmt(Math.round((Number(r.qty) || 0) * (Number(r.price) || 0) * 100))}</span>
            <button type="button" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...blank }])} aria-label="Remove line" className="hidden self-center text-ink-soft hover:text-red-700 sm:block"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setRows([...rows, { ...blank }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add line item</button>
        <span className="text-sm">Total <span className="font-display text-lg font-bold">{fmt(total)}</span></span>
      </div>
    </div>
  );
}
