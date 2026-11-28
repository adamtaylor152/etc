"use client";
// The route planner's reorderable stop list. Same behaviour as components/reorder-list.tsx (drag the handle or tap the
// arrows, nothing is written until a save button is pressed, each save posts the ids in their new order plus its own
// `scope`); this copy only changes how it looks: deliberate move buttons, a real grip, and a save bar that spells out
// what each choice does at the moment of saving.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { btn } from "@/components/ui";

export function RouteReorder({ items, action, hidden = {}, saves }: {
  items: { id: string; node: ReactNode }[]; action: (f: FormData) => void | Promise<void>;
  hidden?: Record<string, string>; saves: { label: string; scope: string; hint: string; primary?: boolean }[];
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
  const arrow = "flex h-7 w-9 items-center justify-center text-ink-soft hover:bg-tint hover:text-navy disabled:text-ink-faint/50 disabled:hover:bg-transparent";
  const changed = order.join(",") !== key;
  return (
    <>
      <ol className="divide-y divide-line-soft">
        {order.map((id, i) => (
          <li key={id} className={`flex items-start gap-2 ${drag === id ? "opacity-40" : ""}`}
            onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag !== id) move(drag, i); }} onDrop={(e) => e.preventDefault()}>
            {items.length > 1 && (
              <span className="no-print mt-3 flex shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-white">
                <button type="button" disabled={i === 0} onClick={() => move(id, i - 1)} aria-label="Move up" title={i === 0 ? "Already first" : "Move up"} className={arrow}><ChevronUp className="size-4" aria-hidden /></button>
                <span draggable title="Drag to reorder" aria-hidden className="flex h-6 w-9 cursor-grab select-none items-center justify-center border-y border-line-soft text-ink-faint hover:bg-tint hover:text-navy active:cursor-grabbing"
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); const li = e.currentTarget.closest("li"); if (li) e.dataTransfer.setDragImage(li, 12, 12); setDrag(id); }}
                  onDragEnd={() => setDrag(null)}><GripVertical className="size-4" /></span>
                <button type="button" disabled={i === order.length - 1} onClick={() => move(id, i + 1)} aria-label="Move down" title={i === order.length - 1 ? "Already last" : "Move down"} className={arrow}><ChevronDown className="size-4" aria-hidden /></button>
              </span>
            )}
            <div className="min-w-0 flex-1">{node.get(id)}</div>
          </li>
        ))}
      </ol>
      {changed && (
        <div className="no-print sticky bottom-16 z-10 mt-3 rounded-xl border border-blue/30 bg-white p-3 shadow-lift sm:bottom-3" role="group" aria-label="Save the new order">
          <p className="text-sm font-semibold">You changed the order. Save it for:</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {saves.map((s) => (
              <form key={s.scope} action={action}>
                {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <input type="hidden" name="ids" value={order.join(",")} /><input type="hidden" name="scope" value={s.scope} />
                <button className={btn(s.primary ? "primary" : "secondary", "min-h-11! w-full")}>{s.label}</button>
                <p className="mt-1 text-xs text-ink-soft">{s.hint}</p>
              </form>
            ))}
          </div>
          <button type="button" onClick={() => setLocal({ key, order: saved })} className="mt-2 inline-flex min-h-9 items-center rounded-lg px-1 text-sm font-medium text-ink-soft hover:text-navy">Put it back (don&apos;t save)</button>
        </div>
      )}
    </>
  );
}
