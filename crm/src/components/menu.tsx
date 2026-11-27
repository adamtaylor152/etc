"use client";
// Dropdown menu for "More" / "+ Create" buttons on detail pages. Items are links or server-action forms.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

export type MenuItem =
  | { label: string; href: string; icon?: ReactNode; danger?: boolean }
  | { label: string; action: (f: FormData) => Promise<void>; fields?: Record<string, string>; icon?: ReactNode; danger?: boolean; confirm?: string }
  | { divider: true };

export function Menu({ label = "More", items, primary = false, align = "right", icon }: { label?: string; items: MenuItem[]; primary?: boolean; align?: "left" | "right"; icon?: "dots" | "chevron" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  const cls = "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-semibold hover:bg-tint";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={icon === "dots" ? label : undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold ${primary ? "border-blue bg-blue text-white hover:bg-blue/90" : "border-line bg-white text-navy hover:bg-tint"}`}>
        {icon === "dots" ? <MoreHorizontal className="size-4" /> : <>{label}<ChevronDown className="size-4" aria-hidden /></>}
      </button>
      {open && (
        <div role="menu" className={`absolute top-full z-30 mt-1 min-w-52 overflow-hidden rounded-lg border border-line bg-white py-1 text-navy shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it, i) => {
            if ("divider" in it) return <hr key={i} className="my-1 border-line" />;
            const tone = it.danger ? " text-red-700" : "";
            if ("href" in it) return <Link key={i} role="menuitem" href={it.href} onClick={() => setOpen(false)} className={cls + tone}>{it.icon}{it.label}</Link>;
            return (
              <form key={i} action={it.action} onSubmit={(e) => { if (it.confirm && !window.confirm(it.confirm)) e.preventDefault(); else setOpen(false); }}>
                {Object.entries(it.fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <button role="menuitem" className={cls + tone}>{it.icon}{it.label}</button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
