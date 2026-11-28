"use client";
// A <select> that submits its form on change (list filters).
/** A date box that reloads the page for that day (route runner). */
export function DatePick({ date, who }: { date: string; who?: string }) {
  return (
    <form className="contents">
      {who && <input type="hidden" name="who" value={who} />}
      <input type="date" name="date" defaultValue={date} aria-label="Day" onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" />
    </form>
  );
}

export function AutoSubmit({ name, defaultValue, options }: { name: string; defaultValue: string; options: { value: string; label: string }[] }) {
  return (
    <select name={name} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-9 rounded-lg border border-line bg-white px-2 text-sm">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
