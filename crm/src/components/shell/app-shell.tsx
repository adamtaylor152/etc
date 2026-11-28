"use client";
// Jobber-style shell: dark sidebar (Create + nav), white top bar (search, messages, account). Sidebar is a drawer on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, ChevronDown, LogOut, Menu, MessageSquare, Plus, X } from "lucide-react";
import { CREATE, NAV } from "./nav";
import { GlobalSearch } from "./global-search";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Closes on outside click / Escape. */
function usePopover() {
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
  return { open, setOpen, ref };
}

// The Create button is the app's primary action wherever it sits: brand blue, white text, on the dark sidebar and the white top bar alike.
function CreateMenu({ onPick, align = "left" }: { onPick?: () => void; align?: "left" | "right" }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-deep max-sm:min-h-11">
        <Plus className="size-4" aria-hidden /> Create
      </button>
      {open && (
        <div role="menu" className={`absolute top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white py-1.5 text-navy shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {CREATE.map((c) => (
            <Link key={c.href} role="menuitem" href={c.href} onClick={() => { setOpen(false); onPick?.(); }} className="flex items-center gap-3 px-4 py-2 text-sm font-medium hover:bg-tint max-sm:min-h-11">
              <c.icon className={`size-4 ${c.color}`} aria-hidden />{c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ counts, onNavigate }: { counts: { unread: number; toMatch: number }; onNavigate?: () => void }) {
  const path = usePathname();
  const badge = (b?: "unread" | "toMatch") => (b && counts[b] ? <span className="ml-auto rounded-full bg-sky px-1.5 text-[11px] font-bold leading-[18px] text-night tabular-nums">{counts[b]}</span> : null);
  return (
    <div className="flex h-full flex-col bg-night text-white">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="font-display text-[1.7rem] font-bold leading-none tracking-tight">etc<span className="text-sky">.</span></Link>
      </div>
      <div className="px-3 pb-3"><CreateMenu onPick={onNavigate} /></div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((group, gi) => (
          <ul key={gi} className="space-y-px border-t border-white/8 py-2.5 first:border-0 first:pt-1">
            {group.map((n) => {
              const active = isActive(path, n.href) && !n.children?.some((c) => isActive(path, c.href));
              const open = isActive(path, n.href) || n.children?.some((c) => isActive(path, c.href));
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium max-sm:min-h-11 ${active ? "bg-white/12 font-semibold text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sky" : "text-white/70 hover:bg-white/8 hover:text-white"}`}>
                    <n.icon className={`size-[18px] shrink-0 ${active ? "text-sky" : ""}`} strokeWidth={1.75} aria-hidden />{n.label}{badge(n.badge)}
                  </Link>
                  {open && n.children && (
                    <ul className="ml-7 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
                      {n.children.map((c) => (
                        <li key={c.href}>
                          <Link href={c.href} onClick={onNavigate} aria-current={isActive(path, c.href) ? "page" : undefined} className={`flex items-center rounded-md px-2 py-1.5 text-[13px] font-medium max-sm:min-h-11 ${isActive(path, c.href) ? "font-semibold text-white" : "text-white/60 hover:text-white"}`}>
                            {c.label}{badge(c.badge)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
    </div>
  );
}

function AccountMenu({ email, signOut }: { email: string; signOut: (f: FormData) => Promise<void> }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account"
        className="flex items-center justify-center gap-1 rounded-full p-1 hover:bg-tint max-sm:size-11">
        <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">{email.slice(0, 1).toUpperCase()}</span>
        <ChevronDown className="hidden size-4 text-ink-soft sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-lg">
          <p className="truncate px-4 py-2 text-xs text-ink-soft">{email}</p>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center px-4 py-2 text-sm font-semibold hover:bg-tint max-sm:min-h-11">Settings</Link>
          <form action={signOut}><button role="menuitem" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold hover:bg-tint max-sm:min-h-11"><LogOut className="size-4" aria-hidden />Sign out</button></form>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, counts, email, signOut }: { children: ReactNode; counts: { unread: number; toMatch: number }; email: string; signOut: (f: FormData) => Promise<void> }) {
  const [drawer, setDrawer] = useState<string | null>(null); // the path the drawer was opened on: navigating closes it
  const path = usePathname();
  const open = drawer === path;
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 lg:block"><Sidebar counts={counts} /></aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-night/60 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setDrawer(null)} />
          <div className="relative h-full w-72 max-w-[85%] shadow-xl">
            <Sidebar counts={counts} onNavigate={() => setDrawer(null)} />
            <button type="button" onClick={() => setDrawer(null)} className="absolute right-2 top-1.5 grid size-11 place-items-center rounded-full text-white/80 hover:bg-white/10" aria-label="Close menu"><X className="size-5" aria-hidden /></button>
          </div>
        </div>
      )}
      {/* Icon buttons are 44px squares on phones (36px from tablet up), so the gaps between them close up to make room. */}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-line bg-white/90 px-2 backdrop-blur-md sm:gap-3 sm:px-6">
        <button type="button" onClick={() => setDrawer(path)} className="grid size-11 place-items-center rounded-lg hover:bg-tint sm:size-9 lg:hidden" aria-label="Open menu"><Menu className="size-5" aria-hidden /></button>
        <Link href="/" aria-label="Home" className="flex min-h-11 items-center px-1 font-display text-xl font-bold lg:hidden">etc<span className="text-blue">.</span></Link>
        <div className="flex min-w-0 flex-1 justify-end lg:block"><GlobalSearch /></div>
        <Link href="/messages" className="relative grid size-11 place-items-center rounded-full hover:bg-tint sm:size-9" aria-label={`Messages${counts.unread ? `, ${counts.unread} unread` : ""}`}>
          <MessageSquare className="size-5 text-navy" aria-hidden />
          {counts.unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-blue px-1 text-center text-[10px] font-bold leading-4 text-white sm:-right-0.5 sm:-top-0.5">{counts.unread}</span>}
        </Link>
        <Link href={counts.toMatch ? "/payments/unmatched" : "/activity"} className="relative hidden size-9 place-items-center rounded-full hover:bg-tint sm:grid" aria-label={counts.toMatch ? `Payments to match: ${counts.toMatch}` : "Activity"}>
          <Bell className="size-5 text-navy" aria-hidden />
          {counts.toMatch > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold leading-4 text-night">{counts.toMatch}</span>}
        </Link>
        <div className="max-sm:ml-1 lg:hidden"><CreateMenu align="right" /></div>
        <AccountMenu email={email} signOut={signOut} />
      </header>
      <main id="main" className="mx-auto max-w-[84rem] px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">{children}</main>
    </div>
  );
}
