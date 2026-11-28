"use client";
// The route planner's reorderable stop list. Same behaviour as components/reorder-list.tsx (drag the handle or tap the
// arrows, nothing is written until a save button is pressed, each save posts the ids in their new order plus its own
// `scope`) and the same bordered arrow buttons; this copy adds a save bar that spells out what each choice does at the
// moment of saving, and shows a long community's first stops with the rest one tap away.
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { ico, step } from "@/components/reorder-list";
import { btn } from "@/components/ui";

export function RouteReorder({ items, action, hidden = {}, saves, cap = 10, start = 1 }: {
  items: { id: string; node: ReactNode }[]; action: (f: FormData) => void | Promise<void>;
  hidden?: Record<string, string>; saves: { label: string; scope: string; hint: string; primary?: boolean }[]; cap?: number;
  /** The number of this list's first stop: rows count up from it by where they sit now (`reorder-n`, globals.css). */
  start?: number;
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
  const changed = order.join(",") !== key;
  // Stops past the cap are hidden, not left out: the save forms post every id from `order`, and the printed sheet
  // lists them all. A half-made order opens the list, so a stop moved past the cap never vanishes.
  const [all, setAll] = useState(false);
  const open = all || changed || order.length <= cap;
  return (
    <>
      <ol className="divide-y divide-line-soft" style={{ counterReset: `reorder ${start - 1}` }}>
        {order.map((id, i) => (
          <li key={id} className={`items-start gap-2 [counter-increment:reorder] ${open || i < cap ? "flex" : "hidden print:flex"} ${drag === id ? "opacity-40" : ""}`}
            onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag !== id) move(drag, i); }} onDrop={(e) => e.preventDefault()}>
            {items.length > 1 && (
              // Stacked on a phone (two full 44px targets beside a narrow row), side by side with a drag handle from `sm`.
              <span className="no-print mt-3 flex shrink-0 items-center gap-1 max-sm:flex-col">
                <span draggable title="Drag to reorder" aria-hidden className="hidden h-8 cursor-grab select-none place-items-center px-1 text-ink-faint hover:text-navy active:cursor-grabbing sm:grid"
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); const li = e.currentTarget.closest("li"); if (li) e.dataTransfer.setDragImage(li, 12, 12); setDrag(id); }}
                  onDragEnd={() => setDrag(null)}><GripVertical {...ico} /></span>
                <button type="button" disabled={i === 0} onClick={() => move(id, i - 1)} aria-label="Move up" title={i === 0 ? "Already first" : "Move up"} className={step}><ArrowUp {...ico} /></button>
                <button type="button" disabled={i === order.length - 1} onClick={() => move(id, i + 1)} aria-label="Move down" title={i === order.length - 1 ? "Already last" : "Move down"} className={step}><ArrowDown {...ico} /></button>
              </span>
            )}
            <div className="min-w-0 flex-1">{node.get(id)}</div>
          </li>
        ))}
      </ol>
      {order.length > cap && !changed && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="no-print inline-flex min-h-9 w-full items-center border-t border-line-soft text-sm font-semibold text-blue hover:text-blue-deep max-sm:min-h-11">
          {all ? `Show the first ${cap}` : `Show all ${order.length.toLocaleString("en-CA")} stops`}
        </button>
      )}
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
          <button type="button" onClick={() => setLocal({ key, order: saved })} className="mt-2 inline-flex min-h-9 max-sm:min-h-11 items-center rounded-lg px-1 text-sm font-medium text-ink-soft hover:text-navy">Put it back (don&apos;t save)</button>
        </div>
      )}
    </>
  );
}
