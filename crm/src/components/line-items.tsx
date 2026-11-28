"use client";
// Line items with a price-book picker: pick a service to fill the name, description + price, or type your own. Live totals.
// Posts lineName[] / lineDesc[] / lineQty[] / linePrice[] (dollars); with `dated`, also lineId[] (existing rows) / lineDate[].
import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { inputCls } from "./ui";

export type Service = { id: string; name: string; description?: string | null; unitPriceCents: number | null };
type Row = { name: string; desc: string; qty: string; price: string; id?: string; date?: string; note?: string };
const blank: Row = { name: "", desc: "", qty: "1", price: "" };
const sub = "w-full min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-[13px]";
const mini = "mb-0.5 block text-xs font-medium text-ink-soft sm:hidden"; // field captions on phones, where the column header row is hidden
const fmt = (c: number) => (c / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export function LineItems({ services, initial = [], label = "Line items", dated = false }: { services: Service[]; initial?: Partial<Row>[]; label?: string; dated?: boolean }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial.map((r) => ({ ...blank, ...r })) : [{ ...blank }]);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((n, r) => n + Math.round((Number(r.qty) || 0) * (Number(r.price) || 0) * 100), 0);
  // Phones: name and details across the top, then quantity, price, line total and remove on one row. From `sm`: one row per line.
  const grid = "grid grid-cols-[4.5rem_minmax(0,6.5rem)_minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_2.25rem]";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{label}</span><span className="text-xs text-ink-soft">Prices include tax</span></div>
      <div className={`hidden border-b border-line pb-1.5 text-xs font-medium text-ink-soft ${grid} sm:grid`}><span>Product or service</span><span>Qty</span><span>Unit price</span><span className="text-right">Total</span><span /></div>
      <div className="divide-y divide-line-soft">
        {rows.map((r, i) => (
          <div key={i} className={`${grid} py-3 sm:items-start`}>
            <div className="col-span-4 space-y-1.5 sm:col-span-1">
              <div className="flex gap-1.5">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-tint text-ink-soft hover:border-ink-faint/60 hover:text-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue" title="Pick from the price book">
                  <BookOpen className="size-4" aria-hidden />
                  <select aria-label="Pick from price book" value="" onChange={(e) => { const s = services.find((x) => x.id === e.target.value); if (s) set(i, { name: s.name, desc: s.description ?? r.desc, price: s.unitPriceCents != null ? String(s.unitPriceCents / 100) : r.price }); }}
                    className="absolute inset-0 size-full cursor-pointer opacity-0">
                    <option value="">Price book</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.unitPriceCents != null ? ` · ${fmt(s.unitPriceCents)}` : ""}</option>)}
                  </select>
                </span>
                <input name="lineName" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Item name" aria-label="Item name" className={inputCls} />
              </div>
              <input name="lineDesc" value={r.desc} onChange={(e) => set(i, { desc: e.target.value })} placeholder="Description (optional)" aria-label="Description" className={sub} />
              {dated && <><input type="hidden" name="lineId" value={r.id ?? ""} /><input name="lineDate" type="date" value={r.date ?? ""} onChange={(e) => set(i, { date: e.target.value })} aria-label="Service date" className={`${sub} sm:w-44`} /></>}
              {r.note && <p className="text-xs text-ink-soft">{r.note}</p>}
            </div>
            <label className="block"><span className={mini}>Qty</span><input name="lineQty" type="number" step="0.25" min="0" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label="Quantity" className={`${inputCls} tabular-nums`} /></label>
            <label className="block"><span className={mini}>Unit price</span><input name="linePrice" type="number" step="0.01" min="0" value={r.price} onChange={(e) => set(i, { price: e.target.value })} placeholder="$" aria-label="Unit price" className={`${inputCls} tabular-nums`} /></label>
            <span className="self-end text-right text-sm font-semibold tabular-nums max-sm:pb-2.5 sm:mt-2.5 sm:self-start"><span className={mini}>Total</span>{fmt(Math.round((Number(r.qty) || 0) * (Number(r.price) || 0) * 100))}</span>
            <button type="button" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...blank }])} aria-label="Remove line" className="grid size-9 place-items-center self-end rounded-lg text-ink-soft hover:bg-red-50 hover:text-red-700 max-sm:mb-0.5 sm:mt-0.5 sm:self-start"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <button type="button" onClick={() => setRows([...rows, { ...blank }])} className="inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-semibold text-blue hover:text-blue-deep"><Plus className="size-4" aria-hidden />Add line item</button>
        <span className="flex items-baseline gap-3 text-sm text-ink-soft">Total <span className="font-display text-xl font-semibold tabular-nums text-navy">{fmt(total)}</span></span>
      </div>
    </div>
  );
}
