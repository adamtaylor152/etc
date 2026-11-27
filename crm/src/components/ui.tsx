// Tiny shared UI kit (Tailwind). Phone-first: big tap targets, readable in a cold driveway.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return <span className={`font-display text-2xl font-bold tracking-tight ${className}`}>etc<span className="text-sky">.</span></span>;
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-tint text-ink-soft border-line",
  blue: "bg-blue/10 text-blue border-blue/20",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  navy: "bg-navy text-white border-navy",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

const BTN = {
  primary: "bg-blue text-white border-blue hover:bg-blue/90",
  secondary: "bg-white text-navy border-line hover:bg-tint",
  danger: "bg-white text-red-700 border-red-200 hover:bg-red-50",
};
type Variant = keyof typeof BTN;
const btn = (v: Variant, extra = "") => `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 text-sm font-semibold transition disabled:opacity-50 ${BTN[v]} ${extra}`;

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

export const inputCls = "w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-base outline-none focus:border-blue focus:ring-2 focus:ring-blue/20";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}

export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">{children}</p>;
}

/** Label/value list for detail pages. */
export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
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
    <nav className="mb-4 flex gap-1 overflow-x-auto">
      {items.map((t) => (
        <Link key={t.href} href={t.href}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${t.label === active ? "bg-navy text-white" : "bg-white text-ink-soft hover:text-navy"}`}>
          {t.label}{t.count != null && <span className="ml-1.5 opacity-70">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
