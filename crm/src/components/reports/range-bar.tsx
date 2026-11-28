// Date range for reports: the presets as one segmented control, with custom dates beside it. State lives in the URL.
import Link from "next/link";
import { Button, inputCls } from "@/components/ui";

/** "Nov 29, 2025 to Nov 28, 2026": a range always shows its years, since reports often span two. */
export const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const rangeLabel = (from: string, to: string) => `${dateLabel(from)} to ${dateLabel(to)}`;

const seg = (on: boolean) => `inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-semibold sm:min-h-9 ${on ? "bg-blue/10 text-blue-deep" : "text-ink-soft hover:bg-tint hover:text-navy"}`;

/** A row of mutually exclusive choices (links). The current one is marked with aria-current and the selection tint. */
export function Segmented({ label, items }: { label: string; items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-sm sm:inline-flex">
      {items.map((i) => <Link key={i.href} href={i.href} aria-current={i.active ? "true" : undefined} className={seg(i.active)}>{i.label}</Link>)}
    </div>
  );
}

export function RangeBar({ base, presets, range }: { base: string; presets: Record<string, string>; range: { from: string; to: string; preset: string } }) {
  const custom = !(range.preset in presets);
  const lbl = `mb-1 block text-xs font-medium ${custom ? "text-blue-deep" : "text-ink-soft"}`;
  return (
    <form action={base} className="no-print mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="w-full sm:w-auto">
        <span className="mb-1 block text-xs font-medium text-ink-soft">Period</span>
        <Segmented label="Period" items={Object.entries(presets).map(([k, label]) => ({ href: `${base}?range=${k}`, label, active: range.preset === k }))} />
      </div>
      <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
        <label className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto"><span className={lbl}>{custom ? "Custom: from" : "From"}</span><input type="date" name="from" defaultValue={range.from} className={`${inputCls} sm:w-auto!`} /></label>
        <label className="min-w-0 flex-1 basis-36 sm:flex-none sm:basis-auto"><span className={lbl}>To</span><input type="date" name="to" defaultValue={range.to} className={`${inputCls} sm:w-auto!`} /></label>
        <Button variant="secondary">Show dates</Button>
      </div>
    </form>
  );
}
