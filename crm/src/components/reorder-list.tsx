"use client";
// A list you reorder by dragging the handle (mouse) or tapping the arrows (touch), then save. Nothing is written
// until a save button is pressed; each button posts the ids in their new order plus its own `scope`.
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { btn } from "./ui";

// The same bordered arrow buttons as the price book's reorder controls; a full 44px on a phone.
const step = "grid size-8 place-items-center rounded-md border border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:bg-tint hover:text-navy disabled:border-line-soft disabled:bg-transparent disabled:text-ink-faint/50 max-sm:size-11";
const ico = { className: "size-4", strokeWidth: 1.75, "aria-hidden": true } as const;

export function ReorderList({ items, action, hidden = {}, saves }: {
  items: { id: string; node: ReactNode }[]; action: (f: FormData) => void | Promise<void>;
  hidden?: Record<string, string>; saves: { label: string; scope: string }[];
}) {
  const saved = items.map((i) => i.id), key = saved.join(",");
  // Keyed on the server's order, so a save (or a stop getting done) drops any half-made local order.
  const [local, setLocal] = useState({ key, order: saved });
  const [drag, setDrag] = useState<string | null>(null);
  const order = local.key === key ? local.order : saved;
  const node = new Map(items.map((i) => [i.id, i.node]));
  const move = (id: string, to: number) => {
    const next = order.filter((x) => x !== id);
    next.splice(to, 0, id);
    setLocal({ key, order: next });
  };
  return (
    <>
      <ol className="divide-y divide-line">
        {order.map((id, i) => (
          <li key={id} className={`flex items-center gap-1 ${drag === id ? "opacity-40" : ""}`}
            onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag !== id) move(drag, i); }} onDrop={(e) => e.preventDefault()}>
            {items.length > 1 && <span className="no-print flex shrink-0 items-center gap-1 py-1.5 pr-1 text-ink-soft">
              {/* Dragging is a mouse thing: on phones the two arrows are the whole control. */}
              <span draggable title="Drag to reorder" aria-hidden className="hidden h-8 cursor-grab select-none place-items-center px-1 text-ink-faint hover:text-navy active:cursor-grabbing sm:grid"
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); const li = e.currentTarget.closest("li"); if (li) e.dataTransfer.setDragImage(li, 12, 12); setDrag(id); }}
                onDragEnd={() => setDrag(null)}><GripVertical {...ico} /></span>
              <button type="button" disabled={i === 0} onClick={() => move(id, i - 1)} aria-label="Move up" className={step}><ArrowUp {...ico} /></button>
              <button type="button" disabled={i === order.length - 1} onClick={() => move(id, i + 1)} aria-label="Move down" className={step}><ArrowDown {...ico} /></button>
            </span>}
            <div className="min-w-0 flex-1">{node.get(id)}</div>
          </li>
        ))}
      </ol>
      {order.join(",") !== key && (
        <div className="no-print sticky bottom-2 z-10 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-tint p-2 text-sm shadow-card">
          <span className="font-semibold">Save this order</span>
          {saves.map((s) => (
            <form key={s.scope} action={action}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="ids" value={order.join(",")} /><input type="hidden" name="scope" value={s.scope} />
              <button className={btn("secondary")}>{s.label}</button>
            </form>
          ))}
          <button type="button" onClick={() => setLocal({ key, order: saved })} className="min-h-10 rounded-lg px-3 font-medium text-ink-soft hover:bg-white hover:text-navy max-sm:min-h-11">Cancel</button>
        </div>
      )}
    </>
  );
}
