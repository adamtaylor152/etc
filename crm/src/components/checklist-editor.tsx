"use client";
// Checklist template editor: items with type, required, show-to-client; reorder; posts items as JSON.
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, inputCls } from "@/components/ui";

type Item = { id: string; label: string; type: string; required: boolean; showClient: boolean };
const TYPES = { CHECKBOX: "Checkbox", YESNO: "Yes / No", TEXT: "Text", NUMBER: "Number", PHOTO: "Photo" };
const newId = () => Math.random().toString(36).slice(2, 10);

export function ChecklistEditor({ action, t, services }: { action: (f: FormData) => Promise<void>; t?: { id: string; name: string; items: Item[]; active: boolean; serviceIds: string[] }; services: { id: string; name: string }[] }) {
  const [items, setItems] = useState<Item[]>(t?.items.length ? t.items : [{ id: newId(), label: "", type: "CHECKBOX", required: true, showClient: true }]);
  const json = useRef<HTMLInputElement>(null);
  const set = (i: number, p: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setItems(n); };
  const iconBtn = "grid size-9 place-items-center rounded-md border border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:bg-tint hover:text-navy disabled:border-line-soft disabled:bg-transparent disabled:text-ink-faint/50";
  const tick = "flex min-h-10 items-center gap-2 text-sm font-medium";
  return (
    <form action={action} onSubmit={() => { json.current!.value = JSON.stringify(items.filter((i) => i.label.trim())); }} className="space-y-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input ref={json} type="hidden" name="items" />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="block min-w-56 flex-1">
          <span className="mb-1 block text-sm font-semibold">Checklist name</span>
          <input name="name" required defaultValue={t?.name} placeholder="e.g. Spring clean-up" className={`${inputCls} font-semibold`} />
        </label>
        {t && <label className={tick}><input type="checkbox" name="active" value="on" defaultChecked={t.active} className="size-5" onChange={(e) => { e.currentTarget.value = e.currentTarget.checked ? "on" : "off"; }} />Active</label>}
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Items</p>
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {items.map((it, i) => (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
              <span className="flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move item ${i + 1} up`} title="Move up" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move item ${i + 1} down`} title="Move down" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
              </span>
              <input value={it.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="What to check" aria-label={`Item ${i + 1} label`} className={`${inputCls} min-w-48 flex-1 basis-56`} />
              <select value={it.type} onChange={(e) => set(i, { type: e.target.value })} aria-label={`Item ${i + 1} answer type`} className={`${inputCls} basis-32 sm:w-36 sm:flex-none`}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <label className={tick}><input type="checkbox" checked={it.required} onChange={(e) => set(i, { required: e.target.checked })} className="size-5" />Required</label>
              <label className={tick}><input type="checkbox" checked={it.showClient} onChange={(e) => set(i, { showClient: e.target.checked })} className="size-5" />Show client</label>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`} title="Remove item" className="ml-auto grid size-9 place-items-center rounded-md text-ink-soft hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
            </li>
          ))}
          {!items.length && <li className="p-4 text-center text-sm text-ink-soft">No items yet. Add the first thing to check.</li>}
        </ul>
        <button type="button" onClick={() => setItems([...items, { id: newId(), label: "", type: "CHECKBOX", required: false, showClient: true }])} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-blue hover:bg-blue/8"><Plus className="size-4" aria-hidden />Add item</button>
      </div>
      {services.length > 0 && (
        <details className="text-sm"><summary className="inline-flex min-h-10 items-center font-semibold">Add automatically to jobs with these services</summary>
          <div className="mt-1 grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">{services.map((s) => <label key={s.id} className="flex min-h-10 items-center gap-2"><input type="checkbox" name="serviceId" value={s.id} defaultChecked={t?.serviceIds.includes(s.id)} className="size-5 shrink-0" />{s.name}</label>)}</div>
        </details>
      )}
      <div><Button>{t ? "Save checklist" : "Add checklist"}</Button></div>
    </form>
  );
}
