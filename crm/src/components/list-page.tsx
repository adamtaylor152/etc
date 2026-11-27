// The Jobber list pattern: metric cards (the first is a clickable status overview), filters, search, sortable table.
// All state is in the URL, so lists are server-rendered, shareable and work without JS.
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { AutoSubmit } from "./auto-submit";

export type Metric = { label: string; value: ReactNode; sub?: ReactNode; href?: string };
export type OverviewRow = { label: string; count: number; href: string; active?: boolean; dot: string };
export type Column = { key: string; label: string; sortable?: boolean; align?: "right"; className?: string };
export type Row = { id: string; href: string; cells: Record<string, ReactNode> };
export type Filter = { name: string; label: string; value: string; options: { value: string; label: string }[] };

/** Build a list URL keeping the current params and changing some. Pure. */
export function listHref(base: string, current: Record<string, string | undefined>, change: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...change })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function ListPage({ title, base, params, newHref, newLabel, actions, overview, metrics = [], filters = [], searchPlaceholder, columns, rows, empty, footer, bulk }: {
  title: string; base: string; params: Record<string, string | undefined>; newHref?: string; newLabel?: string; actions?: ReactNode;
  overview?: OverviewRow[]; metrics?: Metric[]; filters?: Filter[]; searchPlaceholder?: string;
  columns: Column[]; rows: Row[]; empty?: ReactNode; footer?: ReactNode;
  /** Bulk actions: rows get checkboxes tied to this form (by id, so forms don't nest). */
  bulk?: { action: (f: FormData) => Promise<void>; controls: ReactNode };
}) {
  const sort = params.sort, dir = params.dir === "asc" ? "asc" : "desc";
  const filtered = filters.some((f) => f.value) || !!params.q;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        <div className="flex flex-wrap gap-2">
          {actions}
          {newHref && <Link href={newHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue px-4 text-sm font-semibold text-white hover:bg-blue/90"><Plus className="size-4" aria-hidden />{newLabel ?? "New"}</Link>}
        </div>
      </div>

      {(overview || metrics.length > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview && (
            <section className="rounded-lg border border-line bg-white p-4 shadow-card">
              <h2 className="mb-2 text-sm font-bold">Overview</h2>
              <ul className="space-y-1">
                {overview.map((o) => (
                  <li key={o.label}>
                    <Link href={o.href} className={`flex items-center gap-2 rounded px-1 text-sm hover:bg-tint ${o.active ? "font-bold" : ""}`}>
                      <span className={`size-2 rounded-full ${o.dot}`} aria-hidden />{o.label}<span className="ml-auto font-semibold">{o.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {metrics.map((m) => {
            const body = (<><h2 className="text-sm font-bold">{m.label}</h2><p className="mt-2 font-display text-2xl font-bold">{m.value}</p>{m.sub && <p className="mt-1 text-xs text-ink-soft">{m.sub}</p>}</>);
            return m.href
              ? <Link key={m.label} href={m.href} className="rounded-lg border border-line bg-white p-4 shadow-card hover:border-blue">{body}</Link>
              : <section key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-card">{body}</section>;
          })}
        </div>
      )}

      <section className="rounded-lg border border-line bg-white shadow-card">
        <form action={base} className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-auto text-sm font-bold">{filtered ? "Filtered" : "All"} {title.toLowerCase()} <span className="font-normal text-ink-soft">({rows.length})</span></h2>
          {sort && <input type="hidden" name="sort" value={sort} />}
          {sort && <input type="hidden" name="dir" value={dir} />}
          {filters.map((f) => (
            <label key={f.name} className="flex items-center gap-1.5 text-sm">
              <span className="text-ink-soft">{f.label}</span>
              <AutoSubmit name={f.name} defaultValue={f.value} options={f.options} />
            </label>
          ))}
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2.5 focus-within:border-blue">
            <Search className="size-4 text-ink-soft" aria-hidden />
            <input name="q" defaultValue={params.q ?? ""} placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}`} aria-label={searchPlaceholder ?? `Search ${title.toLowerCase()}`} className="w-40 bg-transparent text-sm outline-none sm:w-56" />
          </label>
        </form>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  {bulk && <th className="w-8 px-3"><span className="sr-only">Select</span></th>}
                  {columns.map((c) => {
                    const on = sort === c.key;
                    const next = on && dir === "desc" ? "asc" : "desc";
                    return (
                      <th key={c.key} scope="col" className={`px-4 py-2.5 font-semibold ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                        {c.sortable ? (
                          <Link href={listHref(base, params, { sort: c.key, dir: next })} className="inline-flex items-center gap-1 hover:text-navy">
                            {c.label}{on && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                          </Link>
                        ) : c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group relative border-b border-line/70 last:border-0 hover:bg-tint">
                    {bulk && <td className="px-3 py-3 align-top"><input type="checkbox" name="ids" value={r.id} form="bulk-form" aria-label="Select row" className="relative z-10 size-4" /></td>}
                    {columns.map((c, i) => (
                      <td key={c.key} className={`px-4 py-3 align-top ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                        {i === 0 ? <Link href={r.href} className="font-semibold after:absolute after:inset-0">{r.cells[c.key]}</Link> : r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-8 text-center text-sm text-ink-soft">{empty ?? "Nothing here yet."}</div>}
        {bulk && rows.length > 0 && (
          <form id="bulk-form" action={bulk.action} className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
            <span className="font-semibold text-ink-soft">With selected:</span>{bulk.controls}
          </form>
        )}
        {footer}
      </section>
    </>
  );
}

/** Generic sorter for list rows by a key. Pure. */
export function sortRows<T>(rows: T[], key: string | undefined, dir: string | undefined, by: Record<string, (r: T) => string | number | null>) {
  const f = key ? by[key] : undefined;
  if (!f) return rows;
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = f(a), y = f(b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}
