"use client";
// Settings index navigation: a sticky section list beside the page on desktop. Plain anchor links; the current section
// is marked as you scroll. Below `lg` there is no list: the sections themselves are closed rows (see Group on the
// settings page), and this keeps them honest: all open on a desk, and the one a #hash or a save points at open anywhere.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

export type NavSection = { id: string; label: string };
export type NavPage = { href: string; label: string };

/** Opens the settings section that holds (or is) the element with this id, and puts it at the top if it was closed. */
function reveal(id: string) {
  const el = document.getElementById(id);
  const d = el?.closest<HTMLDetailsElement>("details[data-settings-section]") ?? el?.querySelector<HTMLDetailsElement>("details[data-settings-section]");
  if (!el || !d || d.open) return;
  d.open = true;
  el.scrollIntoView({ block: "start", behavior: "instant" });
}

export function SectionNav({ sections, pages, focus }: { sections: NavSection[]; pages: NavPage[]; focus?: string }) {
  const [active, setActive] = useState(sections[0]?.id);
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

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const all = [...document.querySelectorAll<HTMLDetailsElement>("details[data-settings-section]")];
    const desk = () => { if (wide.matches) for (const d of all) d.open = true; };
    const hash = () => { if (window.location.hash.length > 1) reveal(decodeURIComponent(window.location.hash.slice(1))); };
    desk();
    hash();
    wide.addEventListener("change", desk);
    window.addEventListener("hashchange", hash);
    for (const d of all) d.addEventListener("toggle", desk); // on a desk a section can't be closed from the keyboard either
    return () => {
      wide.removeEventListener("change", desk);
      window.removeEventListener("hashchange", hash);
      for (const d of all) d.removeEventListener("toggle", desk);
    };
  }, []);

  // After a save the page reloads at the top; go back to the section that was saved (the page renders it open) so its
  // notice is in view.
  useEffect(() => {
    if (focus && !window.location.hash) document.getElementById(focus)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [focus]);

  const link = (s: NavSection, extra = "") => (
    <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined} onClick={() => reveal(s.id)}
      className={`flex min-h-9 items-center rounded-lg px-3 text-sm ${active === s.id ? "bg-blue/8 font-semibold text-blue-deep" : "font-medium text-ink-soft hover:bg-tint hover:text-navy"} ${extra}`}>{s.label}</a>
  );
  return (
    <>
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
