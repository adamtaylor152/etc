// Single-series horizontal bars: one hue, a fixed label column, every row labelled with its value (no hover needed).
import type { ReactNode } from "react";
import { cad } from "@/components/billing/money";

export function Bars({ rows, format = cad, empty }: { rows: [string, number][]; format?: (n: number) => string; empty: ReactNode }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([label, v]) => (
        <li key={label} className="grid grid-cols-[6.5rem_1fr_5.75rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_6.5rem]">
          <span className="truncate text-ink-soft" title={label}>{label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-tint" aria-hidden><span className="block h-full rounded-full bg-blue" style={{ width: v > 0 ? `${Math.max(2, (100 * v) / max)}%` : 0 }} /></span>
          <span data-money className={`text-right tabular-nums ${v > 0 ? "font-medium" : "text-ink-soft"}`}>{format(v)}</span>
        </li>
      ))}
    </ul>
  );
}
