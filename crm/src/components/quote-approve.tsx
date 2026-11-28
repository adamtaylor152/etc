/* eslint-disable @next/next/no-img-element -- private line photos via signed URLs, not optimizable */
"use client";
// Client-side quote approval: choose one option when the quote offers them (cards: stacked on a phone, side by side
// on a wide screen), tick optional extras (totals update live), type your name, approve.
import { useState } from "react";
import type { TaxSettings } from "@/server/billing/invoice";
import { optionTotals, type QuoteDiscount, type QuoteOption } from "@/server/status/quote";
import { SignaturePad } from "./signature-pad";

type Line = { id: string; name: string; description: string | null; totalCents: number; isOptional: boolean; isSelected: boolean; qty: string; optionKey: string | null; photo: { sm: string; lg: string } | null };
const money = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 3: "md:grid-cols-3", 4: "sm:grid-cols-2" };

export function QuoteApprove({ token, lines, options, chosen, discount, tax, taxName, action, canAct }: {
  token: string; lines: Line[]; options: QuoteOption[]; chosen: string | null; discount: QuoteDiscount; tax: TaxSettings; taxName: string; action: (f: FormData) => Promise<void>; canAct: boolean;
}) {
  const [picked, setPicked] = useState(() => new Set(lines.filter((l) => l.isOptional && l.isSelected).map((l) => l.id)));
  const [option, setOption] = useState(chosen); // nothing pre-chosen: the client decides
  const ticked = lines.map((l) => ({ ...l, isSelected: picked.has(l.id) }));
  // The discount (when a percent), GST and total all follow the chosen option and the extras ticked.
  const { discountCents, totalCents: total, taxCents, taxIncluded } = optionTotals(ticked, discount, tax, option);
  const undecided = options.length > 0 && !option;
  const common = lines.filter((l) => !l.optionKey);
  const row = (l: Line) => (
    <li key={l.id} className="flex items-start gap-3 py-3">
      {l.isOptional ? (
        <input type="checkbox" name="selected" value={l.id} checked={picked.has(l.id)} disabled={!canAct} className="mt-1 size-5 shrink-0"
          onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} aria-label={`Add ${l.name}`} />
      ) : <span className="mt-1 size-5 shrink-0 text-center text-emerald-600" aria-hidden>✓</span>}
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{l.name}</span>{l.qty && <span className="text-ink-soft"> × {l.qty}</span>}
        {l.isOptional && <span className="ml-1 rounded-full bg-tint px-2 py-0.5 text-xs text-ink-soft">optional</span>}
        {l.description && <span className="block text-sm text-ink-soft">{l.description}</span>}
        {l.photo && <a href={l.photo.lg} target="_blank" rel="noreferrer" className="mt-1 block w-fit"><img src={l.photo.sm} alt={`Photo: ${l.name}`} loading="lazy" className="size-16 rounded-lg object-cover" /></a>}
      </span>
      <span className={`font-semibold ${l.isOptional && !picked.has(l.id) ? "text-ink-soft line-through" : ""}`}>{money(l.totalCents)}</span>
    </li>
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      {options.length > 0 && (
        <div role="radiogroup" aria-label="Choose one option">
          {canAct && <p className="mb-2 font-semibold">Choose one option</p>}
          <div className={`grid gap-3 ${COLS[options.length] ?? ""}`}>
            {options.map((o) => {
              const on = option === o.key;
              return (
                <div key={o.key} className={`flex flex-col rounded-2xl border-2 p-3 ${on ? "border-blue bg-blue/5" : "border-line"} ${chosen && !on ? "opacity-60" : ""}`}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="option" value={o.key} checked={on} required disabled={!canAct} onChange={() => setOption(o.key)} className="mt-0.5 size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{o.name}</span>
                      {o.recommended && <span className="mt-0.5 inline-block rounded-full bg-blue px-2 py-0.5 text-xs font-semibold text-white">Recommended</span>}
                      {chosen === o.key && <span className="mt-0.5 block text-xs font-semibold text-emerald-700">Your choice</span>}
                    </span>
                  </label>
                  <ul className="mt-1 flex-1 divide-y divide-line text-sm">{lines.filter((l) => l.optionKey === o.key).map(row)}</ul>
                  <p className="border-t border-line pt-2 text-right"><span className="font-display text-2xl font-bold">{money(optionTotals(ticked, discount, tax, o.key).totalCents)}</span>{common.length > 0 && <span className="block text-xs text-ink-soft">with everything below</span>}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {common.length > 0 && (
        <div>
          {options.length > 0 && <p className="font-semibold">Included with every option</p>}
          <ul className="divide-y divide-line">{common.map(row)}</ul>
        </div>
      )}
      {undecided ? canAct && <p className="border-t-2 border-navy pt-3 font-semibold">Choose an option above to see your total.</p> : <>
        {discountCents > 0 && <p className="flex justify-between text-sm text-ink-soft"><span>Discount{discount.discountType === "PERCENT" && ` (${discount.discountValue / 100}%)`}</span><span>−{money(discountCents)}</span></p>}
        {taxCents > 0 && !taxIncluded && <p className="flex justify-between text-sm text-ink-soft"><span>{taxName}</span><span>{money(taxCents)}</span></p>}
        <p className="flex items-baseline justify-between border-t-2 border-navy pt-3"><span className="font-semibold">Total{taxIncluded && ` (includes ${taxName} ${money(taxCents)})`}</span><span className="font-display text-3xl font-bold">{money(total)}</span></p>
      </>}
      {canAct && (
        <div className="space-y-3 rounded-2xl bg-tint p-4">
          <label className="block text-sm font-semibold">Your name<input name="name" required maxLength={100} autoComplete="name" className="mt-1 w-full min-h-11 rounded-xl border border-line bg-white px-3" /></label>
          <div><span className="mb-1 block text-sm font-semibold">Signature</span><SignaturePad /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-0.5 size-5" /> I approve this quote and authorize etc. to do the work described.</label>
          <button disabled={undecided} className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white disabled:opacity-50">{undecided ? "Choose an option to approve" : `Approve quote (${money(total)})`}</button>
        </div>
      )}
    </form>
  );
}
