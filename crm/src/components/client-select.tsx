"use client";
// Pick a client inside a form by typing: asks the server as you go, so it works the same with 50 clients or 50,000
// (a <select> of everyone had to stop somewhere). Posts the chosen id as a hidden field.
import { useEffect, useState } from "react";

type Pick = { id: string; name: string };

export function ClientSelect({ name = "clientId", initial, required, none = "No client" }: { name?: string; initial?: Pick | null; required?: boolean; none?: string }) {
  const [picked, setPicked] = useState<Pick | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; title: string; sub: string }[] | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const stop = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?only=clients&q=${encodeURIComponent(term)}`, { signal: stop.signal }).then((r) => (r.ok ? r.json() : { hits: [] })).then((d) => setHits(d.hits)).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); stop.abort(); };
  }, [q]);

  const box = "min-h-10 w-full rounded-lg border border-line bg-white px-3";
  if (picked) return (
    <div className={`${box} flex items-center justify-between gap-2`}>
      <input type="hidden" name={name} value={picked.id} />
      <span className="truncate">{picked.name}</span>
      <button type="button" onClick={() => { setPicked(null); setQ(""); setHits(null); }} className="shrink-0 text-sm font-semibold text-blue">Change</button>
    </div>
  );
  return (
    <div>
      {/* Nothing chosen posts an empty id; `required` holds the form back until someone is picked. */}
      {required ? <input name={name} value="" onChange={() => {}} required tabIndex={-1} aria-hidden className="sr-only" /> : <input type="hidden" name={name} value="" />}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder={`${none}: type a name, phone or email to choose one`} aria-label="Find a client" autoComplete="off" className={box} />
      {q.trim() && hits && (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white text-sm">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => setPicked({ id: h.id, name: h.title })} className="block w-full px-3 py-2 text-left hover:bg-tint">
                <span className="font-semibold">{h.title}</span><span className="block truncate text-xs text-ink-soft">{h.sub}</span>
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-2 text-ink-soft">No clients match.</li>}
        </ul>
      )}
    </div>
  );
}
