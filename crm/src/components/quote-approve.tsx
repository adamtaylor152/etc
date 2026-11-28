/* eslint-disable @next/next/no-img-element -- private line photos via signed URLs, not optimizable */
"use client";
// Client-side quote approval, laid out as a proposal: choose one option when the quote offers them (choice cards:
// stacked on a phone, side by side on a wide screen), tick optional extras (totals update live), then name, signature,
// consent and one "Approve quote" button. On a phone a slim bar keeps the running total in view until the approval
// card is reached.
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { depositCents, type TaxSettings } from "@/server/billing/invoice";
import { optionTotals, type QuoteDiscount, type QuoteOption } from "@/server/status/quote";
import { Cta, TickRow, TotalRow, tap } from "./public/kit";
import { SignaturePad } from "./signature-pad";
import { Badge, Card, inputCls } from "./ui";

type Line = { id: string; name: string; description: string | null; totalCents: number; isOptional: boolean; isSelected: boolean; qty: string; optionKey: string | null; photo: { sm: string; lg: string } | null };
const money = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
// Two or four options pair up on a wide screen; three stay stacked (a third of the reading column is too narrow for a line and its price).
const COLS: Record<number, string> = { 2: "sm:grid-cols-2", 4: "sm:grid-cols-2" };

export function QuoteApprove({ token, lines, options, chosen, discount, tax, taxName, action, canAct, deposit }: {
  token: string; lines: Line[]; options: QuoteOption[]; chosen: string | null; discount: QuoteDiscount; tax: TaxSettings; taxName: string; action: (f: FormData) => Promise<void>; canAct: boolean;
  /** The quote's deposit setting, to show what is due on approval (the same sum the deposit invoice is made from). */
  deposit?: { type: string; value: number; required: boolean };
}) {
  const [picked, setPicked] = useState(() => new Set(lines.filter((l) => l.isOptional && l.isSelected).map((l) => l.id)));
  const [option, setOption] = useState(chosen); // nothing pre-chosen: the client decides
  const ticked = lines.map((l) => ({ ...l, isSelected: picked.has(l.id) }));
  // The discount (when a percent), GST and total all follow the chosen option and the extras ticked.
  const { subtotalCents, discountCents, totalCents: total, taxCents, taxIncluded } = optionTotals(ticked, discount, tax, option);
  const undecided = options.length > 0 && !option;
  const common = lines.filter((l) => !l.optionKey);
  const included = common.filter((l) => !l.isOptional), extras = common.filter((l) => l.isOptional);
  const dueNow = deposit ? depositCents(total, deposit.type, deposit.value) : 0;

  // The phone bar shows only while the approval card is still below the screen.
  const approve = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState(false);
  useEffect(() => {
    const el = approve.current;
    if (!el) return;
    const check = () => setBar(el.getBoundingClientRect().top > window.innerHeight);
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);

  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const body = (l: Line) => (
    <>
      <span className="font-medium">{l.name}</span>{l.qty && <span className="text-ink-soft tabular-nums"> × {l.qty}</span>}
      {l.description && <span className="block text-sm text-ink-soft">{l.description}</span>}
      {l.photo && <a href={l.photo.lg} target="_blank" rel="noreferrer" className="mt-2 block w-fit"><img src={l.photo.sm} alt={`Photo: ${l.name}`} loading="lazy" className="size-16 rounded-lg object-cover" /></a>}
    </>
  );
  const row = (l: Line) => l.isOptional ? (
    <li key={l.id} className="py-1.5">
      <TickRow name="selected" value={l.id} checked={picked.has(l.id)} disabled={!canAct} onChange={(e) => toggle(l.id, e.target.checked)} aria-label={`Add ${l.name}`}
        price={<span className={picked.has(l.id) ? "" : "font-medium text-ink-soft"}>+{money(l.totalCents)}</span>}>
        {body(l)}{l.optionKey && <span className="block text-sm text-ink-soft">Optional</span>}
      </TickRow>
    </li>
  ) : (
    <li key={l.id} className="flex items-start gap-3 py-3">
      <Check className="mt-1 size-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1">{body(l)}</span>
      <span className="shrink-0 font-semibold tabular-nums">{money(l.totalCents)}</span>
    </li>
  );

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="t" value={token} />
      {options.length > 0 && (
        <section role="radiogroup" aria-labelledby="quote-options">
          <h2 id="quote-options" className="mb-3 font-display text-[1.05rem] font-semibold">{canAct ? "Choose one option" : "The options"}</h2>
          <div className={`grid gap-3 ${COLS[options.length] ?? ""}`}>
            {options.map((o) => {
              const on = option === o.key;
              const mine = lines.filter((l) => l.optionKey === o.key);
              return (
                <div key={o.key} className={`flex flex-col rounded-xl border-2 bg-white shadow-card ${on ? "border-blue" : "border-line"} ${chosen && !on ? "opacity-60" : ""}`}>
                  <label className={`flex items-start gap-3 rounded-t-[10px] p-4 ${canAct ? "cursor-pointer" : ""} ${on ? "bg-blue/5" : canAct ? "hover:bg-tint" : ""}`}>
                    <input type="radio" name="option" value={o.key} checked={on} required disabled={!canAct} onChange={() => setOption(o.key)} className="mt-1 size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-lg font-semibold leading-tight">{o.name}</span>
                        {o.recommended && <Badge tone="blue">Recommended</Badge>}
                        {chosen === o.key && <Badge tone="green">Your choice</Badge>}
                      </span>
                      <span className="mt-1.5 block font-display text-[1.75rem] font-semibold leading-none tabular-nums">{money(optionTotals(ticked, discount, tax, o.key).totalCents)}</span>
                      {common.length > 0 && <span className="mt-1 block text-sm text-ink-soft">with everything below</span>}
                    </span>
                  </label>
                  {mine.length > 0 && <ul className="flex-1 divide-y divide-line-soft border-t border-line-soft px-4 pb-1">{mine.map(row)}</ul>}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {included.length > 0 && (
        <Card title={options.length > 0 ? "Included with every option" : "What's included"}>
          <ul className="-mb-2 divide-y divide-line-soft border-t border-line-soft">{included.map(row)}</ul>
        </Card>
      )}
      {extras.length > 0 && (
        <Card title="Optional extras">
          {canAct && <p className="-mt-2 mb-2 text-sm text-ink-soft">Tick anything you&apos;d like added. The total updates as you go.</p>}
          <ul className="-my-1.5">{extras.map(row)}</ul>
        </Card>
      )}
      {undecided ? canAct && (
        <Card title="Your total"><p className="text-ink-soft">Choose an option above to see your total.</p></Card>
      ) : (
        <Card title={canAct ? "Your total" : undefined}>
          <dl className="space-y-2">
            {(discountCents > 0 || (taxCents > 0 && !taxIncluded)) && <TotalRow muted label="Subtotal" value={money(subtotalCents)} />}
            {discountCents > 0 && <TotalRow muted label={<>Discount{discount.discountType === "PERCENT" && ` (${discount.discountValue / 100}%)`}</>} value={`−${money(discountCents)}`} />}
            {taxCents > 0 && !taxIncluded && <TotalRow muted label={taxName} value={money(taxCents)} />}
            <TotalRow strong label={<>Total{taxIncluded && <span className="block text-sm font-normal text-ink-soft">includes {taxName} {money(taxCents)}</span>}</>} value={money(total)} />
            {canAct && dueNow > 0 && <TotalRow label={<>Deposit due when you approve{deposit?.required && <span className="block text-sm text-ink-soft">Needed to book your date</span>}</>} value={<span className="font-semibold">{money(dueNow)}</span>} />}
          </dl>
        </Card>
      )}
      {canAct && (
        <div ref={approve} id="approve" className="scroll-mt-4">
          <Card title="Approve this quote">
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block font-semibold">Your name</span><input name="name" required maxLength={100} autoComplete="name" className={`${inputCls} min-h-12`} /></label>
              <div><span className="mb-1 block font-semibold">Signature</span><SignaturePad /></div>
              <TickRow required>I approve this quote and authorize etc. to do the work described.</TickRow>
              <Cta disabled={undecided} title={undecided ? "Choose one of the options first" : undefined}>{undecided ? "Choose an option to approve" : `Approve quote (${money(total)})`}</Cta>
            </div>
          </Card>
        </div>
      )}
      {canAct && bar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 px-4 py-2.5 shadow-lift backdrop-blur sm:hidden" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 leading-tight">
              <span className="block text-sm text-ink-soft">{undecided ? "Choose an option" : "Total"}</span>
              {!undecided && <span className="font-display text-xl font-semibold tabular-nums">{money(total)}</span>}
            </p>
            <a href="#approve" className={tap("secondary", "shrink-0")}>Go to approve</a>
          </div>
        </div>
      )}
    </form>
  );
}
