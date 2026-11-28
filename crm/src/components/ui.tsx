// Tiny shared UI kit (Tailwind). Phone-first: big tap targets, readable in a cold driveway.
// The look lives in globals.css (tokens) and here (components): pages compose these and rarely style from scratch.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return <span className={`font-display text-2xl font-bold tracking-tight ${className}`}>etc<span className="text-sky">.</span></span>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight sm:text-[2rem]">{title}</h1>
        {sub && <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A work surface. It rests on a hairline; only things that float (menus, drawers) cast a real shadow. */
export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-white p-4 shadow-card sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-[0.95rem] font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-tint text-ink-soft border-line",
  blue: "bg-blue/8 text-blue-deep border-blue/20",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
  navy: "bg-navy text-white border-navy",
} as const;
export type Tone = keyof typeof TONES;

const DOT: Record<Tone, string> = { gray: "bg-ink-faint", blue: "bg-blue", green: "bg-emerald-600", amber: "bg-amber-500", red: "bg-red-600", navy: "bg-sky" };

/** Status label: coloured dot + text on a tinted surface. Colour is never the only signal; the words say it too. */
export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 ${TONES[tone]}`}>
      <span className={`size-1.5 rounded-full ${DOT[tone]}`} aria-hidden />{children}
    </span>
  );
}

const BTN = {
  primary: "bg-blue text-white border-blue shadow-sm hover:bg-blue-deep hover:border-blue-deep",
  secondary: "bg-white text-navy border-line shadow-sm hover:border-ink-faint/60 hover:bg-tint",
  danger: "bg-white text-red-700 border-red-200 shadow-sm hover:bg-red-50 hover:border-red-300",
};
type Variant = keyof typeof BTN;
// 44px tall on phones (gloves, cold thumbs), 40px from tablet up. `max-sm:` so a caller's smaller desktop height still applies there.
export const btn = (v: Variant, extra = "") => `inline-flex min-h-10 max-sm:min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50 disabled:shadow-none ${BTN[v]} ${extra}`;

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={btn(variant, className)} />;
}

export function ButtonLink({ variant = "secondary", className = "", ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={btn(variant, className)} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

// 16px on phones (iOS zooms the page on anything smaller), 14px from tablet up to match the rest of the app.
export const inputCls = "w-full min-h-10 max-sm:min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-base sm:text-sm outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 disabled:bg-tint disabled:text-ink-soft";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}

export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}

/** Nothing here yet: say so plainly and, where there is one, point at the next step. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-tint/40 px-6 py-8 text-center">
      <p className="mx-auto max-w-[48ch] text-sm text-ink-soft">{children}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** Label/value list for detail pages. */
export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k} className="grid grid-cols-3 gap-3 py-2.5 text-sm">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="col-span-2 font-medium whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.label === active ? "page" : undefined}
          className={`-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold max-sm:min-h-11 ${t.label === active ? "border-blue text-navy" : "border-transparent text-ink-soft hover:border-line hover:text-navy"}`}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-tint px-1.5 text-xs text-ink-soft tabular-nums">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A headline count reads with thousands separators ("1,034"). Anything that is not a number passes through. */
export const figure = (v: ReactNode) => (typeof v === "number" ? v.toLocaleString("en-CA") : v);

/** A headline number with its label (overview tiles on list pages, storms, reports). The figure shrinks with a narrow tile, so "$11,635.50" fits two-up on a phone. */
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "";
  return (
    <div className="@container min-w-0 rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className={`mt-1 font-display text-[clamp(1.15rem,14cqw,1.7rem)] font-semibold leading-none tabular-nums [overflow-wrap:anywhere] ${color}`}>{figure(value)}</div>
      {sub && <div className="mt-1.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

/** A message across the top of a page: something saved, something to know, something wrong. */
export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "good" | "warn" | "bad" }) {
  const cls = { info: "border-blue/25 bg-blue/5 text-navy", good: "border-emerald-200 bg-emerald-50 text-emerald-900", warn: "border-amber-200 bg-amber-50 text-amber-950", bad: "border-red-200 bg-red-50 text-red-900" }[tone];
  return <p role={tone === "bad" ? "alert" : "status"} className={`mb-4 rounded-lg border px-3.5 py-2.5 text-sm font-medium ${cls}`}>{children}</p>;
}
