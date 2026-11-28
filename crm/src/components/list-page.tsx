// The Jobber list pattern: metric cards (the first is a clickable status overview), filters, search, sortable table.
// All state is in the URL, so lists are server-rendered, shareable and work without JS.
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Plus, Search, SearchX } from "lucide-react";
import { AutoSubmit } from "./auto-submit";
import { btn, figure } from "./ui";

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

export const PAGE_SIZE = 50;
/** Which rows a page shows. Pure: clamps to the last page so a stale ?page= never lands on nothing. */
export function pageOf(page: string | undefined, total: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const n = Math.min(pages, Math.max(1, Math.floor(Number(page)) || 1));
  return { page: n, pages, skip: (n - 1) * size, take: size, from: total ? (n - 1) * size + 1 : 0, to: Math.min(total, n * size), total };
}

const num = (n: number) => n.toLocaleString("en-CA");

/** "Showing 51–100 of 734" with previous/next. Renders nothing when everything fits on one page. */
export function Pager({ base, params, at }: { base: string; params: Record<string, string | undefined>; at: ReturnType<typeof pageOf> }) {
  if (at.pages <= 1) return null;
  const page = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold shadow-sm max-sm:min-h-11";
  const prev = <ChevronLeft className="-ml-1 size-4" aria-hidden />, next = <ChevronRight className="-mr-1 size-4" aria-hidden />;
  const link = (n: number, label: string, forward: boolean) => n < 1 || n > at.pages
    ? <span aria-disabled="true" title={forward ? "This is the last page" : "This is the first page"} className={`${page} cursor-not-allowed text-ink-soft opacity-50`}>{!forward && prev}{label}{forward && next}</span>
    : <Link href={listHref(base, params, { page: n > 1 ? String(n) : undefined })} rel={forward ? "next" : "prev"} className={`${page} text-navy hover:border-ink-faint/60 hover:bg-tint`}>{!forward && prev}{label}{forward && next}</Link>;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-sm">
      <span className="tabular-nums text-ink-soft">Showing <span className="font-semibold text-navy">{num(at.from)}–{num(at.to)}</span> of <span className="font-semibold text-navy">{num(at.total)}</span></span>
      <span className="flex gap-2">{link(at.page - 1, "Previous", false)}{link(at.page + 1, "Next", true)}</span>
    </nav>
  );
}

// The same visual language as `Stat` in the kit (label, headline number, quiet sub-line), so every tile reads as one family.
const TILE = "rounded-xl border border-line bg-white shadow-card";
const TILE_LABEL = "text-xs font-medium text-ink-soft";
// Phones: metrics are compact label/number rows inside one card. From `sm` up each is a tile of its own.
const METRIC = "group/tile @container grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 max-sm:min-h-11 sm:block sm:rounded-xl sm:border sm:border-line sm:bg-white sm:p-4 sm:shadow-card";

export function ListPage({ title, base, params, newHref, newLabel, actions, overview, metrics = [], filters = [], searchPlaceholder, columns, rows, empty, footer, bulk, at }: {
  title: string; base: string; params: Record<string, string | undefined>; newHref?: string; newLabel?: string; actions?: ReactNode;
  overview?: OverviewRow[]; metrics?: Metric[]; filters?: Filter[]; searchPlaceholder?: string;
  columns: Column[]; rows: Row[]; empty?: ReactNode; footer?: ReactNode;
  /** Bulk actions: rows get checkboxes tied to this form (by id, so forms don't nest). */
  bulk?: { action: (f: FormData) => Promise<void>; controls: ReactNode };
  /** Paging: `rows` is one page of `at.total` matches (search, filter and sort links go back to page 1). */
  at?: ReturnType<typeof pageOf>;
}) {
  const sort = params.sort, dir = params.dir === "asc" ? "asc" : "desc";
  const filtered = filters.some((f) => f.value) || !!params.q;
  const noun = title.toLowerCase();
  const total = at?.total ?? rows.length;
  const sortable = columns.filter((c) => c.sortable);
  const sortHref = (c: Column) => listHref(base, params, { sort: c.key, dir: sort === c.key && dir === "desc" ? "asc" : "desc", page: undefined });
  const wide = (overview?.length ?? 0) > 5; // a long status list gets two columns and a wider tile
  // Phones: each row is a small grid. Line one is the first column with the status at the right; the other columns sit
  // on line two (right-aligned ones, money and dates, at the right). From `sm` up it is an ordinary table again.
  const lead = bulk ? "col-start-2" : "col-start-1", side = bulk ? "col-start-3" : "col-start-2";
  const place = (c: Column, i: number) => i === 0 ? `${lead} min-w-0`
    : c.key === "status" ? `${side} row-start-1 justify-self-end`
    : c.align === "right" ? `${side} self-end justify-self-end max-sm:text-[13px]`
    : `${lead} min-w-0 max-sm:text-[13px]`;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight sm:text-[2rem]">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {newHref && <Link href={newHref} className={btn("primary")}><Plus className="-ml-1 size-4" aria-hidden />{newLabel ?? "New"}</Link>}
        </div>
      </div>

      {(overview || metrics.length > 0) && (
        <div className={`mb-5 grid gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          {overview && (
            <section className={`${TILE} p-4 ${wide ? "lg:col-span-2" : ""}`} aria-label={`${title} by status`}>
              <h2 className={TILE_LABEL}>Overview</h2>
              <ul className={`-mx-1.5 mt-1.5 grid gap-x-3 ${wide ? "sm:grid-cols-2" : ""}`}>
                {overview.map((o) => (
                  <li key={o.label} className="min-w-0">
                    <Link href={o.href} aria-current={o.active ? "true" : undefined}
                      className={`flex min-h-7 items-center gap-2 rounded-md px-1.5 py-0.5 text-sm leading-tight hover:bg-tint max-sm:min-h-11 ${o.active ? "bg-tint font-semibold" : ""}`}>
                      <span className={`size-2 shrink-0 rounded-full ${o.dot}`} aria-hidden />
                      {/* A long status name takes a second line before it is cut. */}
                      <span className="line-clamp-2 min-w-0">{o.label}</span>
                      <span className={`ml-auto pl-1 tabular-nums ${o.active ? "" : "font-medium"} ${o.count ? "" : "text-ink-faint"}`}>{num(o.count)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {metrics.length > 0 && (
            <div className={`divide-y divide-line-soft overflow-hidden ${TILE} sm:contents`}>
              {metrics.map((m) => {
                const body = (
                  <>
                    <h2 className={`${TILE_LABEL} flex items-center justify-between gap-2`}>{m.label}{m.href && <ChevronRight className="hidden size-4 text-ink-faint group-hover/tile:text-blue sm:block" aria-hidden />}</h2>
                    <p className="row-span-2 font-display text-[1.35rem] font-semibold leading-none tabular-nums sm:mt-1 sm:text-[clamp(1.15rem,14cqw,1.7rem)]">{figure(m.value)}</p>
                    {m.sub && <p className="text-xs text-ink-soft sm:mt-1.5">{m.sub}</p>}
                  </>
                );
                return m.href
                  ? <Link key={m.label} href={m.href} className={`${METRIC} hover:bg-tint sm:hover:border-ink-faint/60 sm:hover:bg-white`}>{body}</Link>
                  : <section key={m.label} className={METRIC}>{body}</section>;
              })}
            </div>
          )}
        </div>
      )}

      <section className={`group/list ${TILE}`}>
        <form action={base} role="search" className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <h2 className="font-display text-[0.95rem] font-semibold sm:mr-auto">
            {filtered ? "Filtered" : "All"} {noun}
            <span className="ml-2 rounded-full bg-tint px-2 py-0.5 font-sans text-xs font-medium text-ink-soft tabular-nums">{num(total)}</span>
            {filtered && <Link href={base} className="ml-3 inline-flex items-center font-sans text-sm font-medium text-blue hover:text-blue-deep max-sm:min-h-11 max-sm:align-middle">Clear</Link>}
          </h2>
          {sort && <input type="hidden" name="sort" value={sort} />}
          {sort && <input type="hidden" name="dir" value={dir} />}
          {filters.length > 0 && (
            <div className={`grid gap-2 sm:flex sm:items-center sm:gap-3 ${filters.length > 1 ? "grid-cols-2" : ""}`}>
              {filters.map((f) => (
                <label key={f.name} className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-soft sm:flex-row sm:items-center sm:gap-2 sm:text-sm sm:font-normal [&_select]:w-full [&_select]:min-w-0 [&_select]:text-navy [&_select]:hover:border-ink-faint/60 max-sm:[&_select]:h-11 max-sm:[&_select]:text-base sm:[&_select]:w-auto sm:[&_select]:max-w-48">
                  {f.label}
                  <AutoSubmit name={f.name} defaultValue={f.value} options={f.options} />
                </label>
              ))}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 hover:border-ink-faint/60 focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/20 max-sm:order-first sm:min-h-9">
            <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
            <input type="search" name="q" defaultValue={params.q ?? ""} enterKeyHint="search" placeholder={searchPlaceholder ?? `Search ${noun}`} aria-label={searchPlaceholder ?? `Search ${noun}`}
              className="min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none sm:w-60 sm:flex-none sm:text-sm lg:w-72" />
          </label>
          {sortable.length > 0 && rows.length > 0 && (
            <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:hidden">
              <span className="shrink-0 text-xs font-medium text-ink-soft">Sort</span>
              {sortable.map((c) => {
                const on = sort === c.key;
                return (
                  <Link key={c.key} href={sortHref(c)} aria-current={on ? "true" : undefined}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-blue/30 bg-blue/8 text-blue-deep" : "border-line bg-white text-ink-soft"}`}>
                    {c.label}{on && (dir === "asc" ? <ArrowUp className="size-3.5" aria-label="ascending" /> : <ArrowDown className="size-3.5" aria-label="descending" />)}
                  </Link>
                );
              })}
            </div>
          )}
        </form>
        {rows.length ? (
          <div className="sm:overflow-x-auto">
            <table className="block w-full text-sm sm:table">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-line bg-tint/50 text-left">
                  {bulk && <th className="w-10 pl-4"><span className="sr-only">Select</span></th>}
                  {columns.map((c) => {
                    const on = sort === c.key;
                    return (
                      <th key={c.key} scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}
                        className={`whitespace-nowrap px-4 py-2 text-xs font-medium text-ink-soft ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                        {c.sortable ? (
                          <Link href={sortHref(c)} title={on ? `Sorted ${dir === "asc" ? "ascending" : "descending"}. Select to reverse.` : `Sort by ${c.label.toLowerCase()}`}
                            className={`group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-line-soft hover:text-navy ${on ? "font-semibold text-navy" : ""}`}>
                            {c.label}
                            {on
                              ? (dir === "asc" ? <ArrowUp className="size-3.5 text-blue" aria-hidden /> : <ArrowDown className="size-3.5 text-blue" aria-hidden />)
                              : <ChevronsUpDown className="size-3.5 text-ink-faint/70 group-hover/sort:text-ink-soft" aria-hidden />}
                          </Link>
                        ) : c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {rows.map((r) => (
                  <tr key={r.id} className={`relative grid items-start gap-x-3 gap-y-0.5 border-b border-line-soft px-4 py-3 max-sm:py-2 last:border-0 hover:bg-tint has-[:checked]:bg-blue/5 sm:table-row sm:p-0 ${bulk ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}>
                    {bulk && (
                      <td className="col-start-1 row-span-2 self-center sm:w-10 sm:py-3.5 sm:pl-4 sm:align-top">
                        <label className="relative z-10 -my-2 -ml-3 grid size-11 place-items-center sm:m-0 sm:block sm:size-auto"><input type="checkbox" name="ids" value={r.id} form="bulk-form" aria-label="Select row" className="block size-5 sm:mt-0.5 sm:size-4" /></label>
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td key={c.key} className={`sm:px-4 sm:py-3.5 sm:align-top ${place(c, i)} ${c.align === "right" ? "text-right tabular-nums sm:whitespace-nowrap" : ""} ${c.className ?? ""}`}>
                        {i === 0 ? <Link href={r.href} className="font-semibold after:absolute after:inset-0 max-sm:block max-sm:min-h-11 max-sm:content-center">{r.cells[c.key]}</Link> : r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-tint text-ink-soft" aria-hidden>{filtered ? <SearchX className="size-5" /> : <Inbox className="size-5" />}</span>
            <p className="mx-auto max-w-[48ch] text-sm font-medium">{empty ?? "Nothing here yet."}</p>
            {filtered ? (
              <>
                <p className="mx-auto mt-1 max-w-[48ch] text-sm text-ink-soft">Check the spelling, or clear the search and filters to see all {noun}.</p>
                <div className="mt-4 flex justify-center"><Link href={base} className={btn("secondary")}>Clear search and filters</Link></div>
              </>
            ) : newHref && <div className="mt-4 flex justify-center"><Link href={newHref} className={btn("primary")}><Plus className="-ml-1 size-4" aria-hidden />{newLabel ?? "New"}</Link></div>}
          </div>
        )}
        {bulk && rows.length > 0 && (
          // Shown only while at least one row is ticked (CSS :has, so the list still needs no JavaScript).
          <form id="bulk-form" action={bulk.action}
            className="sticky bottom-[4.5rem] z-20 mx-3 mb-3 hidden flex-wrap items-center gap-2 rounded-xl border border-blue/30 bg-white p-2.5 pl-3.5 text-sm shadow-lift group-has-[td_input:checked]/list:flex sm:bottom-3">
            <span className="mr-1 font-semibold">With the ticked {noun}</span>{bulk.controls}
          </form>
        )}
        {at && <Pager base={base} params={params} at={at} />}
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
