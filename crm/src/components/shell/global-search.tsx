"use client";
// Top-bar search (⌘K / Ctrl+K): debounced, grouped results, arrow keys + Enter. A field in the bar on a desktop; on
// phones and tablets a magnifier button that opens the field across the whole bar.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, Hammer, Home, Inbox, Receipt, Search, User, X } from "lucide-react";
import type { SearchHit } from "@/server/search";

const ICON = { client: User, property: Home, request: Inbox, quote: FileText, job: Hammer, invoice: Receipt } as const;
const COLOR = { client: "text-navy", property: "text-ink-soft", request: "text-orange-700", quote: "text-rose-700", job: "text-emerald-700", invoice: "text-blue" } as const;

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  // Below `lg` there is no room for a search field in the bar: a magnifier button opens one across the whole bar.
  const [sheet, setSheet] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setSheet(false); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSheet(true); setOpen(true); input.current?.focus(); } };
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setSheet(false); } };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, []);
  // The field is hidden until the sheet opens, so it can only take focus once it is on screen.
  useEffect(() => { if (sheet) input.current?.focus(); }, [sheet]);

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
  const go = (h: SearchHit) => { close(); setQ(""); setHits([]); router.push(h.href); };

  return (
    <div ref={box} className="lg:relative lg:max-w-xl">
      {!sheet && <button type="button" onClick={() => { setSheet(true); setOpen(true); }} aria-label="Search" className="grid size-11 place-items-center rounded-full hover:bg-tint sm:size-9 lg:hidden"><Search className="size-5 text-navy" aria-hidden /></button>}
      {/* Below `lg` this row is the sheet: it covers the top bar edge to edge while open. From `lg` it is the field in the bar. */}
      <div className={`items-center gap-1 lg:flex ${sheet ? "flex max-lg:absolute max-lg:inset-0 max-lg:z-30 max-lg:bg-white max-lg:px-2 max-lg:sm:px-6" : "hidden"}`}>
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-tint px-3 focus-within:border-blue focus-within:bg-white lg:h-10">
          <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && shown[sel]) { e.preventDefault(); go(shown[sel]); }
              if (e.key === "Escape") { close(); input.current?.blur(); }
            }}
            enterKeyHint="search" placeholder="Search clients, addresses, phone, #numbers" aria-label="Search" role="combobox" aria-expanded={open && shown.length > 0} aria-controls="search-results"
            className="min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none lg:text-sm" />
          <kbd className="hidden rounded border border-line bg-white px-1.5 text-[10px] font-semibold text-ink-soft lg:block">⌘K</kbd>
        </label>
        <button type="button" onClick={close} aria-label="Close search" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-tint hover:text-navy lg:hidden"><X className="size-5" aria-hidden /></button>
      </div>
      {open && q.trim() && (
        <ul id="search-results" role="listbox" className="absolute inset-x-2 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg sm:inset-x-6 lg:inset-x-0">
          {shown.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              <li key={`${h.kind}:${h.id}`} role="option" aria-selected={i === sel}>
                <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 px-3 py-2 text-left max-sm:min-h-11 ${i === sel ? "bg-tint" : ""}`}>
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
