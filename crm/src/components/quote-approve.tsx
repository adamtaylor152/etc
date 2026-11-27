"use client";
// Client-side quote approval: tick optional extras (total updates live), type your name, approve.
import { useState } from "react";

type Line = { id: string; name: string; description: string | null; totalCents: number; isOptional: boolean; isSelected: boolean; qty: string };
const money = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function QuoteApprove({ token, lines, discountCents, action, canAct }: {
  token: string; lines: Line[]; discountCents: number; action: (f: FormData) => Promise<void>; canAct: boolean;
}) {
  const [picked, setPicked] = useState(() => new Set(lines.filter((l) => l.isOptional && l.isSelected).map((l) => l.id)));
  const total = Math.max(0, lines.filter((l) => !l.isOptional || picked.has(l.id)).reduce((a, l) => a + l.totalCents, 0) - discountCents);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3 py-3">
            {l.isOptional ? (
              <input type="checkbox" name="selected" value={l.id} checked={picked.has(l.id)} disabled={!canAct} className="mt-1 size-5 shrink-0"
                onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} aria-label={`Add ${l.name}`} />
            ) : <span className="mt-1 size-5 shrink-0 text-center text-emerald-600" aria-hidden>✓</span>}
            <span className="flex-1">
              <span className="font-semibold">{l.name}</span>{l.qty && <span className="text-ink-soft"> × {l.qty}</span>}
              {l.isOptional && <span className="ml-1 rounded-full bg-tint px-2 py-0.5 text-xs text-ink-soft">optional</span>}
              {l.description && <span className="block text-sm text-ink-soft">{l.description}</span>}
            </span>
            <span className={`font-semibold ${l.isOptional && !picked.has(l.id) ? "text-ink-soft line-through" : ""}`}>{money(l.totalCents)}</span>
          </li>
        ))}
      </ul>
      {discountCents > 0 && <p className="flex justify-between text-sm text-ink-soft"><span>Discount</span><span>−{money(discountCents)}</span></p>}
      <p className="flex items-baseline justify-between border-t-2 border-navy pt-3"><span className="font-semibold">Total (tax included)</span><span className="font-display text-3xl font-bold">{money(total)}</span></p>
      {canAct && (
        <div className="space-y-3 rounded-2xl bg-tint p-4">
          <label className="block text-sm font-semibold">Your name<input name="name" required maxLength={100} autoComplete="name" className="mt-1 w-full min-h-11 rounded-xl border border-line bg-white px-3" /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-0.5 size-5" /> I approve this quote and would like etc. to do the work.</label>
          <button className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white">Approve quote ({money(total)})</button>
        </div>
      )}
    </form>
  );
}
