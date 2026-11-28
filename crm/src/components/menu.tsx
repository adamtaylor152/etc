"use client";
// Dropdown menu for "More" / "+ Create" buttons on detail pages. Items are links or server-action forms.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { btn } from "./ui";

export type MenuItem =
  | { label: string; href: string; icon?: ReactNode; danger?: boolean }
  | { label: string; action: (f: FormData) => Promise<void>; fields?: Record<string, string>; icon?: ReactNode; danger?: boolean; confirm?: string }
  | { divider: true };

export function Menu({ label = "More", items, primary = false, align = "right", icon }: { label?: string; items: MenuItem[]; primary?: boolean; align?: "left" | "right"; icon?: "dots" | "chevron" }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState(align);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  // Open towards whichever side has room, so the panel never runs off a phone screen (the header wraps there).
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!open && r) setSide(align === "right" ? (r.right - 240 < 8 ? "left" : "right") : (r.left + 240 > window.innerWidth - 8 ? "right" : "left"));
    setOpen(!open);
  };
  const cls = "flex min-h-10 max-sm:min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium [&_svg]:shrink-0";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label={icon === "dots" ? label : undefined}
        className={btn(primary ? "primary" : "secondary")}>
        {icon === "dots" ? <MoreHorizontal className="size-4" aria-hidden /> : <>{label}<ChevronDown className={`-mr-1 size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></>}
      </button>
      {open && (
        <div role="menu" className={`absolute top-full z-30 mt-1.5 min-w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-1 text-navy shadow-lift ${side === "right" ? "right-0" : "left-0"}`}>
          {items.map((it, i) => {
            if ("divider" in it) return <hr key={i} className="-mx-1 my-1 border-line-soft" />;
            const tone = it.danger ? " text-red-700 hover:bg-red-50" : " hover:bg-tint";
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
