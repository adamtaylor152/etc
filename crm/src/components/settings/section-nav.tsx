"use client";
// Settings index navigation: a sticky section list beside the page on desktop, a compact "Jump to" menu on phones.
// Plain anchor links; the current section is marked as you scroll. Also brings a just-saved section back into view.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

export type NavSection = { id: string; label: string };
export type NavPage = { href: string; label: string };

export function SectionNav({ sections, pages, focus }: { sections: NavSection[]; pages: NavPage[]; focus?: string }) {
  const [active, setActive] = useState(sections[0]?.id);
  const menu = useRef<HTMLDetailsElement>(null);
  const ids = sections.map((s) => s.id).join(",");

  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const pick = () => {
      // The last section whose top has passed under the sticky header; the final one once the page is at its end.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const cur = atEnd ? els[els.length - 1] : [...els].reverse().find((e) => e.getBoundingClientRect().top <= 120) ?? els[0];
      if (cur) setActive(cur.id);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    return () => window.removeEventListener("scroll", pick);
  }, [ids]);

  // After a save the page reloads at the top; go back to the section that was saved so its notice is in view.
  useEffect(() => {
    if (focus && !window.location.hash) document.getElementById(focus)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [focus]);

  const link = (s: NavSection, extra = "") => (
    <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} onClick={() => { if (menu.current) menu.current.open = false; }}
      className={`flex min-h-9 items-center rounded-lg px-3 text-sm ${active === s.id ? "bg-blue/8 font-semibold text-blue-deep" : "font-medium text-ink-soft hover:bg-tint hover:text-navy"} ${extra}`}>{s.label}</a>
  );
  return (
    <>
      <details ref={menu} className="mb-5 rounded-xl border border-line bg-white shadow-card lg:hidden">
        <summary className="flex min-h-11 items-center px-4 text-sm font-semibold">Jump to a section</summary>
        <nav aria-label="Settings sections" className="grid grid-cols-2 gap-x-2 border-t border-line-soft p-2">
          {sections.map((s) => link(s, "min-h-11"))}
        </nav>
      </details>
      <aside className="hidden lg:block">
        <nav aria-label="Settings sections" className="sticky top-20 space-y-0.5">
          <p className="px-3 pb-1 text-xs font-medium text-ink-soft">On this page</p>
          {sections.map((s) => link(s))}
          <p className="px-3 pb-1 pt-5 text-xs font-medium text-ink-soft">More settings</p>
          {pages.map((p) => (
            <Link key={p.href} href={p.href} className="flex min-h-9 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-tint hover:text-navy">
              {p.label}<ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}
