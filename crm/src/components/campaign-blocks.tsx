"use client";
// Email content blocks: heading, text, button (with link), divider. {first_name} is filled in per client.
// Two panes on a desk: the blocks you edit on the left, a sketch of the email they make on the right.
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { inputCls } from "@/components/ui";

type Block = { type: "heading" | "text" | "button" | "divider"; text: string; url: string };
const LABEL: Record<Block["type"], string> = { heading: "Heading", text: "Text", button: "Button", divider: "Divider" };
const iconBtn = "grid size-8 place-items-center rounded-md border border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:bg-tint hover:text-navy disabled:border-line-soft disabled:bg-transparent disabled:text-ink-faint/50";
const sample = (t: string) => t.replaceAll("{first_name}", "Sam");

export function CampaignBlocks({ initial, disabled }: { initial: Block[]; disabled?: boolean }) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const set = (i: number, p: Partial<Block>) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: number) => { const n = [...blocks]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setBlocks(n); };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Content</p>
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        {blocks.map((b, i) => (
          <div key={i} className="rounded-lg border border-line bg-white p-2.5">
            <div className="mb-1.5 flex items-center gap-1">
              <span className="flex-1 text-xs font-medium text-ink-soft">{LABEL[b.type]}</span>
              {!disabled && (
                <>
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${LABEL[b.type].toLowerCase()} up`} title="Move up" className={iconBtn}><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${LABEL[b.type].toLowerCase()} down`} title="Move down" className={iconBtn}><ArrowDown className="size-4" aria-hidden /></button>
                  <button type="button" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))} aria-label={`Remove ${LABEL[b.type].toLowerCase()}`} title="Remove" className="grid size-8 place-items-center rounded-md text-ink-soft hover:bg-red-50 hover:text-red-700"><Trash2 className="size-4" aria-hidden /></button>
                </>
              )}
            </div>
            {b.type === "heading" && <input value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} aria-label="Heading" className={`${inputCls} font-semibold`} />}
            {b.type === "text" && <textarea value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} rows={4} aria-label="Text" className={inputCls} />}
            {b.type === "button" && <div className="grid gap-2 sm:grid-cols-2"><input value={b.text} disabled={disabled} onChange={(e) => set(i, { text: e.target.value })} placeholder="Button label" aria-label="Button label" className={inputCls} /><input value={b.url} disabled={disabled} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://" aria-label="Button link" className={inputCls} /></div>}
            {b.type === "divider" && <hr className="my-1 border-line" />}
          </div>
        ))}
        {!blocks.length && <p className="rounded-lg border border-dashed border-line bg-tint/40 px-4 py-6 text-center text-sm text-ink-soft">Nothing in this email yet. Add a heading or some text.</p>}
        {!disabled && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(["heading", "text", "button", "divider"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setBlocks([...blocks, { type: t, text: "", url: "" }])} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-sm font-medium hover:border-ink-faint/60 hover:bg-tint"><Plus className="size-4 text-ink-soft" aria-hidden />{LABEL[t]}</button>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-soft">Use {"{first_name}"} for the client&apos;s first name. Your mailing address and an unsubscribe link are added automatically.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Preview</p>
        <div className="rounded-lg bg-tint p-3 lg:sticky lg:top-20">
          <div className="mx-auto max-w-[600px] rounded-lg border border-line bg-white px-5 py-6" aria-label="Email preview">
            <div className="space-y-4">
              {blocks.map((b, i) => (
                b.type === "heading" ? <p key={i} className="font-display text-xl font-semibold leading-snug">{sample(b.text) || <span className="text-ink-faint">Heading</span>}</p>
                : b.type === "text" ? <p key={i} className="whitespace-pre-line break-words text-[15px] leading-relaxed">{sample(b.text) || <span className="text-ink-faint">Text</span>}</p>
                : b.type === "button" ? <p key={i}><span className="inline-flex min-h-11 max-w-full items-center rounded-lg bg-blue px-5 text-[15px] font-semibold text-white">{sample(b.text) || "Button"}</span>{b.url && <span className="mt-1 block break-all text-xs text-ink-soft">Goes to {b.url}</span>}</p>
                : <hr key={i} className="border-line" />
              ))}
              {!blocks.length && <p className="text-center text-sm text-ink-soft">Your email shows here as you build it.</p>}
            </div>
            <p className="mt-6 border-t border-line-soft pt-3 text-center text-xs text-ink-soft">Your mailing address · Unsubscribe</p>
          </div>
          <p className="mt-2 text-xs text-ink-soft">A sketch with a made-up first name. Send a test to see the real email with your logo and footer.</p>
        </div>
      </div>
    </div>
  );
}
