"use client";
// Email content blocks: heading, text, button (with link), divider. {first_name} is filled in per client.
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

type Block = { type: "heading" | "text" | "button" | "divider"; text: string; url: string };

export function CampaignBlocks({ initial, disabled }: { initial: Block[]; disabled?: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const set = (i: number, p: Partial<Block>) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: number) => { const n = [...blocks]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setBlocks(n); };
  const inp = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-2">
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      {blocks.map((b, i) => (
        <div key={i} className="flex gap-2 rounded-lg border border-line p-2">
          <span className="flex flex-col text-ink-soft">
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
            <button type="button" disabled={disabled || i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-xs font-semibold uppercase text-ink-soft">{b.type}</span>
            {b.type === "heading" && <input value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} aria-label="Heading" className={`${inp} font-bold`} />}
            {b.type === "text" && <textarea value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} rows={4} aria-label="Text" className={inp} />}
            {b.type === "button" && <div className="grid gap-1 sm:grid-cols-2"><input value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} placeholder="Button label" aria-label="Button label" className={inp} /><input value={b.url} disabled={disabled} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://" aria-label="Button link" className={inp} /></div>}
          </div>
          {!disabled && <button type="button" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))} aria-label="Remove block" className="self-start text-ink-soft hover:text-red-700"><Trash2 className="size-4" /></button>}
        </div>
      ))}
      {!disabled && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {(["heading", "text", "button", "divider"] as const).map((t) => <button key={t} type="button" onClick={() => setBlocks([...blocks, { type: t, text: "", url: "" }])} className="rounded-full border border-line px-3 py-1 hover:bg-tint">+ {t}</button>)}
        </div>
      )}
      <p className="text-xs text-ink-soft">Use {"{first_name}"} for the client&apos;s first name. Your mailing address and an unsubscribe link are added automatically.</p>
    </div>
  );
}
