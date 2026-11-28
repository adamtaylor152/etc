"use client";
// Controls that submit their form on change (list filters, the route runner's day).
const control = "rounded-lg border border-line bg-white px-2.5 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-sm";

/** A date box that reloads the page for that day (route runner: the crew use it on a phone, so it is a full 44px there). */
export function DatePick({ date, who }: { date: string; who?: string }) {
  return (
    <form className="contents">
      {who && <input type="hidden" name="who" value={who} />}
      <input type="date" name="date" defaultValue={date} aria-label="Day" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`${control} min-h-11 tabular-nums sm:min-h-9`} />
    </form>
  );
}

/** A <select> that submits its form on change (list filters). */
export function AutoSubmit({ name, defaultValue, options }: { name: string; defaultValue: string; options: { value: string; label: string }[] }) {
  return (
    <select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`${control} min-h-9`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
