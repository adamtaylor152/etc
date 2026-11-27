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

function CreateMenu({ onPick, align = "left", light = false }: { onPick?: () => void; align?: "left" | "right"; light?: boolean }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${light ? "bg-blue text-white hover:bg-blue/90" : "bg-sky text-navy hover:bg-sky/90"}`}>
        <Plus className="size-4" aria-hidden /> Create
      </button>
      {open && (
        <div role="menu" className={`absolute top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-white py-1 text-navy shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          {CREATE.map((c) => (
            <Link key={c.href} role="menuitem" href={c.href} onClick={() => { setOpen(false); onPick?.(); }} className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold hover:bg-tint">
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
  const badge = (b?: "unread" | "toMatch") => (b && counts[b] ? <span className="ml-auto rounded-full bg-sky px-1.5 text-[11px] font-bold text-navy">{counts[b]}</span> : null);
  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/" onClick={onNavigate} className="font-display text-2xl font-bold tracking-tight">etc<span className="text-sky">.</span></Link>
      </div>
      <div className="px-3 pb-3"><CreateMenu onPick={onNavigate} /></div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((group, gi) => (
          <ul key={gi} className="space-y-0.5 border-t border-white/10 py-2 first:border-0">
            {group.map((n) => {
              const active = isActive(path, n.href) && !n.children?.some((c) => isActive(path, c.href));
              const open = isActive(path, n.href) || n.children?.some((c) => isActive(path, c.href));
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
                    <n.icon className="size-4 shrink-0" aria-hidden />{n.label}{badge(n.badge)}
                  </Link>
                  {open && n.children && (
                    <ul className="ml-7 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">
                      {n.children.map((c) => (
                        <li key={c.href}>
                          <Link href={c.href} onClick={onNavigate} className={`flex items-center rounded-md px-2 py-1.5 text-[13px] font-semibold ${isActive(path, c.href) ? "text-white" : "text-white/65 hover:text-white"}`}>
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
        className="flex items-center gap-1 rounded-full p-1 hover:bg-tint">
        <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">{email.slice(0, 1).toUpperCase()}</span>
        <ChevronDown className="hidden size-4 text-ink-soft sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg">
          <p className="truncate px-4 py-2 text-xs text-ink-soft">{email}</p>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm font-semibold hover:bg-tint">Settings</Link>
          <form action={signOut}><button role="menuitem" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold hover:bg-tint"><LogOut className="size-4" aria-hidden />Sign out</button></form>
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
          <button type="button" className="absolute inset-0 bg-navy/50" aria-label="Close menu" onClick={() => setDrawer(null)} />
          <div className="relative h-full w-72 max-w-[85%] shadow-xl">
            <Sidebar counts={counts} onNavigate={() => setDrawer(null)} />
            <button type="button" onClick={() => setDrawer(null)} className="absolute right-2 top-3 rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Close menu"><X className="size-5" /></button>
          </div>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white px-3 sm:gap-3 sm:px-5">
        <button type="button" onClick={() => setDrawer(path)} className="rounded-lg p-2 hover:bg-tint lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
        <Link href="/" className="font-display text-xl font-bold lg:hidden">etc<span className="text-blue">.</span></Link>
        <div className="min-w-0 flex-1"><GlobalSearch /></div>
        <Link href="/messages" className="relative rounded-full p-2 hover:bg-tint" aria-label={`Messages${counts.unread ? `, ${counts.unread} unread` : ""}`}>
          <MessageSquare className="size-5 text-navy" />
          {counts.unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-blue px-1 text-center text-[10px] font-bold leading-4 text-white">{counts.unread}</span>}
        </Link>
        <Link href={counts.toMatch ? "/payments/unmatched" : "/activity"} className="relative hidden rounded-full p-2 hover:bg-tint sm:block" aria-label={counts.toMatch ? `Payments to match: ${counts.toMatch}` : "Activity"}>
          <Bell className="size-5 text-navy" />
          {counts.toMatch > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{counts.toMatch}</span>}
        </Link>
        <div className="w-28 lg:hidden"><CreateMenu align="right" light /></div>
        <AccountMenu email={email} signOut={signOut} />
      </header>
      <main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>
    </div>
  );
}
