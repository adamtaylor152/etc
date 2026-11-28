"use client";
// Controls that submit their form on change (list filters, the route runner's day).
import { inputCls } from "./ui";

/**
 * A labelled date box that reloads the page for that day (routes, the route runner). The kit's input, 44px on a phone.
 * `night` is for the route runner's dark surface: same shape, light text, and the browser's own dark date picker.
 */
export function DatePick({ date, who, night }: { date: string; who?: string; night?: boolean }) {
  return (
    <form className="contents">
      {who && <input type="hidden" name="who" value={who} />}
      <label className={`flex items-center gap-2 text-sm font-medium ${night ? "text-white/75" : "text-ink-soft"}`}>
        {/* The crew's phone keeps its one-line header: there the label is for screen readers only. */}
        <span className={night ? "max-sm:sr-only" : ""}>Day</span>
        <input type="date" name="date" defaultValue={date} onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={`${inputCls} w-auto! tabular-nums ${night ? "border-white/20! bg-white/10! text-white [color-scheme:dark] hover:border-white/40! focus:border-sky!" : "text-navy"}`} />
      </label>
    </form>
  );
}

/** A <select> that submits its form on change (list filters). */
export function AutoSubmit({ name, defaultValue, options }: { name: string; defaultValue: string; options: { value: string; label: string }[] }) {
  return (
    <select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="min-h-9 rounded-lg border border-line bg-white px-2.5 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-sm">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
