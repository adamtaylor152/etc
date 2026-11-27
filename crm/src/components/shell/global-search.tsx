"use client";
// Top-bar search (⌘K / Ctrl+K): debounced, grouped results, arrow keys + Enter.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, Hammer, Home, Inbox, Receipt, Search, User } from "lucide-react";
import type { SearchHit } from "@/server/search";

const ICON = { client: User, property: Home, request: Inbox, quote: FileText, job: Hammer, invoice: Receipt } as const;
const COLOR = { client: "text-navy", property: "text-ink-soft", request: "text-orange-700", quote: "text-rose-700", job: "text-emerald-700", invoice: "text-blue" } as const;

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 && !/^#?\d+$/.test(term)) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] })).then((d) => { setHits(d.hits ?? []); setSel(0); }).catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const shown = q.trim().length >= 1 ? hits : [];
  const go = (h: SearchHit) => { setOpen(false); setQ(""); setHits([]); router.push(h.href); };

  return (
    <div ref={box} className="relative max-w-xl">
      <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-tint px-3 focus-within:border-blue focus-within:bg-white">
        <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && shown[sel]) { e.preventDefault(); go(shown[sel]); }
            if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
          }}
          placeholder="Search clients, addresses, phone, #numbers" aria-label="Search" role="combobox" aria-expanded={open && shown.length > 0} aria-controls="search-results"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <kbd className="hidden rounded border border-line bg-white px-1.5 text-[10px] font-semibold text-ink-soft md:block">⌘K</kbd>
      </label>
      {open && q.trim() && (
        <ul id="search-results" role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {shown.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              <li key={`${h.kind}:${h.id}`} role="option" aria-selected={i === sel}>
                <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === sel ? "bg-tint" : ""}`}>
                  <Icon className={`size-4 shrink-0 ${COLOR[h.kind]}`} aria-hidden />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{h.title}</span><span className="block truncate text-xs text-ink-soft">{h.sub}</span></span>
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-3 text-sm text-ink-soft">No matches yet. Try a name, street, phone number or #number.</li>}
        </ul>
      )}
    </div>
  );
}
