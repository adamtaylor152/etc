// How money reads on the billing pages: one format, right-aligned, tabular, and totals as a ledger.
import type { ReactNode } from "react";

/** "$1,234.50": always two decimals so a column of amounts lines up. Negatives use a true minus sign. */
export function cad(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "−" : ""}$${Math.floor(abs / 100).toLocaleString("en-CA")}.${String(abs % 100).padStart(2, "0")}`;
}

/** An amount in a row or column: tabular, never wraps. */
export function Amount({ cents, className = "" }: { cents: number; className?: string }) {
  return <span data-money className={`whitespace-nowrap tabular-nums ${className}`}>{cad(cents)}</span>;
}

export type LedgerRow = {
  label: ReactNode;
  cents: number;
  /** plain: a step on the way (subtotal, GST). minus: taken off (discount, paid). total: the invoice total. strong: the line that matters (balance). */
  kind?: "plain" | "minus" | "total" | "strong";
  /** Words that go with a coloured strong line ("past due", "paid"), so colour is never the only signal. */
  note?: ReactNode;
  tone?: "bad" | "good" | "muted";
};

/** Totals block: labels left, figures right, the strongest line last. Sits at the right edge of its card from tablet up. */
export function Ledger({ rows, className = "" }: { rows: LedgerRow[]; className?: string }) {
  return (
    <dl className={`text-sm sm:pl-[calc(100%-20rem)] ${className}`}>
      {rows.map((r, i) => {
        const kind = r.kind ?? "plain";
        const color = r.tone === "bad" ? "text-red-700" : r.tone === "good" ? "text-emerald-700" : r.tone === "muted" ? "text-ink-soft" : "";
        if (kind === "strong") return (
          <div key={i} className={`flex items-baseline justify-between gap-4 pt-2.5 ${i > 0 ? "mt-2 border-t-2 border-navy" : ""} ${color}`}>
            <dt className="font-semibold">{r.label}{r.note && <span className="ml-1.5 text-xs font-medium">{r.note}</span>}</dt>
            <dd data-money className="whitespace-nowrap font-display text-[1.35rem] font-semibold leading-none tabular-nums">{cad(r.cents)}</dd>
          </div>
        );
        if (kind === "total") return (
          <div key={i} className={`flex items-baseline justify-between gap-4 pt-2 font-semibold ${i > 0 ? "mt-1.5 border-t border-line" : ""}`}>
            <dt>{r.label}</dt><dd data-money className="whitespace-nowrap tabular-nums">{cad(r.cents)}</dd>
          </div>
        );
        return (
          <div key={i} className="flex items-baseline justify-between gap-4 py-1 text-ink-soft">
            <dt>{r.label}</dt><dd data-money className="whitespace-nowrap tabular-nums">{kind === "minus" ? cad(-Math.abs(r.cents)) : cad(r.cents)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Section title used inside cards that hold more than one block. */
export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-display text-[0.95rem] font-semibold ${className}`}>{children}</h3>;
}
