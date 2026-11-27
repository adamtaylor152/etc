"use client";
// Desktop top nav: a few links plus grouped dropdowns (▾) so it fits on one line.
// Closes on outside click, Escape, or navigation; the section you're in is highlighted.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string; badge?: number };
type Entry = { label: string; href?: string; badge?: number; items?: Item[] };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function TopNav({ unread, toMatch, email, signOut }: { unread: number; toMatch: number; email: string; signOut: (f: FormData) => Promise<void> }) {
  const path = usePathname();
  // A menu belongs to the page it was opened on, so navigating closes it without an effect.
  const [opened, setOpened] = useState<{ label: string; path: string } | null>(null);
  const open = opened?.path === path ? opened.label : null;
  const setOpen = (label: string | null) => setOpened(label ? { label, path } : null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpened(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpened(null); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, []);

  const entries: Entry[] = [
    { label: "Today", href: "/" },
    { label: "Field", items: [{ href: "/routes", label: "Route" }, { href: "/snow", label: "Snow" }, { href: "/schedule", label: "Schedule" }] },
    { label: "Sales", items: [{ href: "/requests", label: "Requests" }, { href: "/quotes", label: "Quotes" }, { href: "/clients", label: "Clients" }] },
    { label: "Jobs", href: "/jobs" },
    { label: "Money", badge: toMatch, items: [
      { href: "/invoices", label: "Invoices" }, { href: "/billing", label: "Billing run" },
      { href: "/payments", label: "Payments" }, { href: "/payments/unmatched", label: "To match", badge: toMatch },
    ] },
    { label: "Messages", href: "/messages", badge: unread },
    { label: "More", items: [{ href: "/reports", label: "Reports" }, { href: "/settings", label: "Settings" }] },
  ];

  const pill = (active: boolean) => `flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-semibold lg:px-3 ${active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`;
  const Badge = ({ n }: { n?: number }) => (n ? <span className="rounded-full bg-sky px-1.5 text-xs text-navy">{n}</span> : null);

  return (
    <nav ref={ref} className="hidden flex-1 items-center gap-0.5 sm:flex lg:gap-1" aria-label="Main">
      {entries.map((e) => {
        if (e.href) return <Link key={e.label} href={e.href} className={pill(isActive(path, e.href))}>{e.label}<Badge n={e.badge} /></Link>;
        const active = e.items!.some((i) => isActive(path, i.href));
        const isOpen = open === e.label;
        return (
          <div key={e.label} className="relative">
            <button type="button" aria-expanded={isOpen} aria-haspopup="menu" onClick={() => setOpen(isOpen ? null : e.label)} className={pill(active || isOpen)}>
              {e.label}<Badge n={e.badge} /><span aria-hidden className={`text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <div role="menu" className="absolute left-0 top-full z-30 mt-2 min-w-44 overflow-hidden rounded-xl border border-line bg-white py-1 text-navy shadow-lg">
                {e.items!.map((i) => (
                  <Link key={i.href} role="menuitem" href={i.href} className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-semibold hover:bg-tint ${isActive(path, i.href) ? "text-blue" : ""}`}>
                    {i.label}{i.badge ? <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">{i.badge}</span> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="relative ml-auto">
        <button type="button" aria-expanded={open === "account"} aria-haspopup="menu" onClick={() => setOpen(open === "account" ? null : "account")} className={pill(open === "account")}>
          Account<span aria-hidden className={`text-[10px] transition-transform ${open === "account" ? "rotate-180" : ""}`}>▾</span>
        </button>
        {open === "account" && (
          <div role="menu" className="absolute right-0 top-full z-30 mt-2 min-w-56 overflow-hidden rounded-xl border border-line bg-white py-1 text-navy shadow-lg">
            <p className="truncate px-4 py-2 text-xs text-ink-soft">{email}</p>
            <form action={signOut}><button role="menuitem" className="w-full px-4 py-2 text-left text-sm font-semibold hover:bg-tint">Sign out</button></form>
          </div>
        )}
      </div>
    </nav>
  );
}
