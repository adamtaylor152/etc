"use client";
// Checklist template editor: items with type, required, show-to-client; reorder; posts items as JSON.
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

type Item = { id: string; label: string; type: string; required: boolean; showClient: boolean };
const TYPES = { CHECKBOX: "Checkbox", YESNO: "Yes / No", TEXT: "Text", NUMBER: "Number", PHOTO: "Photo" };
const newId = () => Math.random().toString(36).slice(2, 10);

export function ChecklistEditor({ action, t, services }: { action: (f: FormData) => Promise<void>; t?: { id: string; name: string; items: Item[]; active: boolean; serviceIds: string[] }; services: { id: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>(t?.items.length ? t.items : [{ id: newId(), label: "", type: "CHECKBOX", required: true, showClient: true }]);
  const json = useRef<HTMLInputElement>(null);
  const set = (i: number, p: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setItems(n); };
  const inp = "min-h-9 rounded-lg border border-line bg-white px-2 text-sm";
  return (
    <form action={action} onSubmit={() => { json.current!.value = JSON.stringify(items.filter((i) => i.label.trim())); }} className="space-y-3">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input ref={json} type="hidden" name="items" />
      <div className="flex flex-wrap items-center gap-3">
        <input name="name" required defaultValue={t?.name} placeholder="Checklist name" aria-label="Checklist name" className={`${inp} min-w-56 flex-1 font-semibold`} />
        {t && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" value="on" defaultChecked={t.active} className="size-4" onChange={(e) => { e.currentTarget.value = e.currentTarget.checked ? "on" : "off"; }} />Active</label>}
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
            <span className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="text-ink-soft disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
              <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="text-ink-soft disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
            </span>
            <input value={it.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="What to check" aria-label="Item label" className={`${inp} min-w-48 flex-1`} />
            <select value={it.type} onChange={(e) => set(i, { type: e.target.value })} aria-label="Answer type" className={inp}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.required} onChange={(e) => set(i, { required: e.target.checked })} className="size-4" />Required</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.showClient} onChange={(e) => set(i, { showClient: e.target.checked })} className="size-4" />Show client</label>
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove item" className="text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setItems([...items, { id: newId(), label: "", type: "CHECKBOX", required: false, showClient: true }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue"><Plus className="size-4" />Add item</button>
      {services.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Add automatically to jobs with these services</summary>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{services.map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="serviceId" value={s.id} defaultChecked={t?.serviceIds.includes(s.id)} className="size-4" />{s.name}</label>)}</div>
        </details>
      )}
      <button className="min-h-10 rounded-lg bg-blue px-4 text-sm font-semibold text-white">Save checklist</button>
    </form>
  );
}
