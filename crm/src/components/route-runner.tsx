"use client";
// Storm-day route runner: the next stop big, glove-sized buttons, navigation, photos. Works offline: stops are kept on
// the phone, and actions/photos queue up and send themselves when signal comes back.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, MapPin, Navigation, Phone, SkipForward, Truck, WifiOff } from "lucide-react";
import type { RunStop } from "@/server/runner";

type Action = { id: string; visitId: string; to: "EN_ROUTE" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"; depthCm?: number | null; iceMeltApplied?: boolean | null; skipReason?: string; skipNote?: string; lat?: number | null; lng?: number | null };
const QKEY = "etc-run-queue", PKEY = "etc-run-autotext";

// ---- tiny IndexedDB store for queued photos (blobs don't fit in localStorage) ----
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open("etc-run", 1); r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function photoQueue(op: "add" | "all" | "del", v?: { id: string; visitId: string; kind: string; blob: Blob } | string) {
  const db = await idb();
  return new Promise<{ id: string; visitId: string; kind: string; blob: Blob }[]>((res, rej) => {
    const tx = db.transaction("photos", op === "all" ? "readonly" : "readwrite"), s = tx.objectStore("photos");
    const r = op === "add" ? s.put(v) : op === "del" ? s.delete(v as string) : s.getAll();
    r.onsuccess = () => res(op === "all" ? (r.result as never) : []);
    r.onerror = () => rej(r.error);
  });
}
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.8));
  } catch { return file; }
}
// Location is a nice-to-have: never let a pending permission prompt (where the API's timeout doesn't run) block a tap.
const where = () => new Promise<{ lat: number; lng: number } | null>((r) => {
  setTimeout(() => r(null), 4000);
  if (!navigator.geolocation) return r(null);
  navigator.geolocation.getCurrentPosition((p) => r({ lat: p.coords.latitude, lng: p.coords.longitude }), () => r(null), { timeout: 4000, maximumAge: 60_000 });
});

export function RouteRunner({ date, initial }: { date: string; initial: RunStop[] }) {
  const cacheKey = `etc-run-${date}`;
  const [stops, setStops] = useState<RunStop[]>(initial);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [autoText, setAutoText] = useState(false);
  const [depth, setDepth] = useState("");
  const [iceMelt, setIceMelt] = useState(false);
  const [showList, setShowList] = useState(false);
  const [msg, setMsg] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const cam = useRef<HTMLInputElement>(null);
  const camKind = useRef<"BEFORE" | "AFTER">("AFTER");

  const queue = (): Action[] => JSON.parse(localStorage.getItem(QKEY) || "[]");
  const countPending = useCallback(async () => setPending(queue().length + (await photoQueue("all").catch(() => [])).length), []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    for (const a of queue()) {
      const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }).catch(() => null);
      if (!r) break; // still offline
      if (r.status === 401) { setMsg("Signed out. Open the app and sign in again to send your saved updates."); break; }
      if (r.ok || r.status === 409 || r.status === 404) localStorage.setItem(QKEY, JSON.stringify(queue().filter((x) => x.id !== a.id)));
      if (r.status === 409) setMsg((await r.json().catch(() => ({}))).error ?? "One action couldn't be applied");
    }
    for (const p of await photoQueue("all").catch(() => [])) {
      const body = new FormData(); body.append("visitId", p.visitId); body.append("kind", p.kind); body.append("file", p.blob, "photo.jpg");
      const r = await fetch("/api/uploads", { method: "POST", body }).catch(() => null);
      if (!r) break;
      // Signed out: keep the photo and say so. Anything else the server refused for good is dropped.
      if (r.status === 401) { setMsg("Signed out. Open the app and sign in again to send your saved photos."); break; }
      if (r.ok || r.status < 500) await photoQueue("del", p.id);
    }
    await countPending();
  }, [countPending]);

  // Fresh stops when online; the last copy when not.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the saved offline copy once on mount
    setAutoText(localStorage.getItem(PKEY) === "1");
    const saved = localStorage.getItem(cacheKey);
    if (!navigator.onLine && saved) setStops(JSON.parse(saved));
    else localStorage.setItem(cacheKey, JSON.stringify(initial));
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    const t = setInterval(() => void flush(), 30_000);
    void flush();
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(t); };
  }, [cacheKey, initial, flush]);

  const open = useMemo(() => stops.filter((s) => !["COMPLETED", "SKIPPED"].includes(s.state)), [stops]);
  const cur = open[0];
  const done = stops.length - open.length;

  async function act(s: RunStop, to: Action["to"], extra: Partial<Action> = {}) {
    const pos = to === "COMPLETED" || to === "IN_PROGRESS" ? await where() : null;
    const a: Action = { id: crypto.randomUUID(), visitId: s.visitId, to, lat: pos?.lat ?? null, lng: pos?.lng ?? null, ...extra };
    const next = stops.map((x) => (x.visitId === s.visitId ? { ...x, state: to } : x));
    setStops(next);
    localStorage.setItem(cacheKey, JSON.stringify(next));
    localStorage.setItem(QKEY, JSON.stringify([...queue(), a]));
    // Finishing a stop can text the next client "on my way".
    if ((to === "COMPLETED" || to === "SKIPPED") && autoText) {
      const n = next.find((x) => !["COMPLETED", "SKIPPED"].includes(x.state));
      if (n && n.state === "SCHEDULED") { localStorage.setItem(QKEY, JSON.stringify([...queue(), { id: crypto.randomUUID(), visitId: n.visitId, to: "EN_ROUTE" as const }])); setStops(next.map((x) => (x.visitId === n.visitId ? { ...x, state: "EN_ROUTE" } : x))); }
    }
    setDepth(""); setIceMelt(false);
    await countPending();
    void flush();
  }
  async function addPhoto(files: FileList | null) {
    if (!files?.length || !cur) return;
    for (const f of [...files].slice(0, 5)) await photoQueue("add", { id: crypto.randomUUID(), visitId: cur.visitId, kind: camKind.current, blob: await shrink(f) });
    if (cam.current) cam.current.value = "";
    setMsg(`${camKind.current === "BEFORE" ? "Before" : "After"} photo saved${navigator.onLine ? "" : " (sends when you have signal)"}`);
    await countPending();
    void flush();
  }

  const nav = (s: RunStop) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat != null ? `${s.lat},${s.lng}` : encodeURIComponent(s.address + ", Calgary")}`;
  const big = "flex min-h-16 items-center justify-center gap-2 rounded-2xl text-lg font-bold";
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white shadow-inner"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} /></div>
        <span className="text-sm font-bold">{done}/{stops.length}</span>
      </div>
      {(!online || pending > 0) && (
        <p className={`flex items-center gap-2 rounded-xl p-2 text-sm font-semibold ${online ? "bg-blue/10 text-blue" : "bg-amber-100 text-amber-900"}`}>
          {!online && <WifiOff className="size-4" />}{online ? `Sending ${pending} saved update${pending === 1 ? "" : "s"}…` : `No signal. ${pending} update${pending === 1 ? "" : "s"} saved on this phone.`}
        </p>
      )}
      {msg && <p className="rounded-xl bg-white p-2 text-sm" aria-live="polite">{msg}</p>}

      {cur ? (
        <section className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Stop {done + 1} of {stops.length}{cur.time && ` · ${cur.time}`}{cur.communityName && ` · ${cur.communityName}`}</p>
          <h2 className="font-display text-2xl font-bold">{cur.address}</h2>
          <p className="text-base">{cur.client} · {cur.job}</p>
          {cur.sizeNote && <p className="mt-2 rounded-xl border border-amber-300 bg-amber-100 p-2 text-sm font-semibold text-amber-950">{cur.sizeNote}</p>}
          {cur.more && <a href={`/stop/${cur.visitId}`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl border-2 border-navy text-sm font-semibold">Checklist &amp; signature for this stop</a>}
          {cur.extras?.length > 0 && <p className="mt-2 rounded-xl border border-blue/30 bg-blue/5 p-2 text-sm font-semibold">Also this visit: {cur.extras.join(", ")}</p>}
          {(cur.gate || cur.access || cur.pets || cur.hazards) && (
            <ul className="mt-2 space-y-0.5 rounded-xl bg-amber-50 p-2 text-sm text-amber-950">
              {cur.gate && <li><b>Gate:</b> {cur.gate}</li>}{cur.access && <li>{cur.access}</li>}{cur.pets && <li><b>Pets:</b> {cur.pets}</li>}{cur.hazards && <li><b>Careful:</b> {cur.hazards}</li>}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={nav(cur)} target="_blank" rel="noreferrer" className={`${big} bg-navy text-white`}><Navigation className="size-5" />Navigate</a>
            {cur.phone ? <a href={`tel:${cur.phone}`} className={`${big} border-2 border-line bg-white`}><Phone className="size-5" />Call</a> : <span />}
          </div>
          {cur.state === "SCHEDULED" && <button onClick={() => act(cur, "EN_ROUTE")} className={`${big} mt-2 w-full border-2 border-blue text-blue`}><Truck className="size-5" />On my way</button>}
          {(cur.state === "SCHEDULED" || cur.state === "EN_ROUTE") && <button onClick={() => act(cur, "IN_PROGRESS")} className={`${big} mt-2 w-full border-2 border-line`}><MapPin className="size-5" />Arrived</button>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => { camKind.current = "BEFORE"; cam.current?.click(); }} className={`${big} border-2 border-dashed border-blue text-blue`}><Camera className="size-5" />Before</button>
            <button onClick={() => { camKind.current = "AFTER"; cam.current?.click(); }} className={`${big} border-2 border-dashed border-blue text-blue`}><Camera className="size-5" />After</button>
          </div>
          <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => addPhoto(e.target.files)} />
          {cur.snow && (
            <div className="mt-3 flex items-center gap-3 text-base">
              <label className="flex items-center gap-2">Snow <input inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))} placeholder="cm" className="h-12 w-20 rounded-xl border-2 border-line px-3 text-lg" /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={iceMelt || false} onChange={(e) => setIceMelt(e.target.checked)} className="size-7" />Ice melt</label>
            </div>
          )}
          <button onClick={() => act(cur, "COMPLETED", { depthCm: depth ? Number(depth) : null, iceMeltApplied: cur.snow ? iceMelt : null })} className={`${big} mt-3 w-full bg-emerald-600 text-white`}><Check className="size-6" />Done</button>
          <details className="mt-2">
            <summary className="cursor-pointer list-none text-center text-sm font-semibold text-ink-soft"><SkipForward className="mr-1 inline size-4" />Skip this stop</summary>
            <input value={skipNote} onChange={(e) => setSkipNote(e.target.value)} maxLength={500} placeholder="Note for the office (optional)" className="mt-2 min-h-11 w-full rounded-xl border-2 border-line px-3 text-sm" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[["ALREADY_CLEARED", "Already clear"], ["BLOCKED_BY_CAR", "Car in the way"], ["NO_ACCESS", "Can't get in"], ["CLIENT_CANCELLED", "Client cancelled"], ["OTHER", "Too big for the price"]].map(([k, l]) => (
                <button key={k} onClick={() => { act(cur, "SKIPPED", { skipReason: k, ...(skipNote.trim() ? { skipNote: skipNote.trim() } : {}) }); setSkipNote(""); }} className="min-h-12 rounded-xl border-2 border-line text-sm font-semibold">{l}</button>
              ))}
            </div>
          </details>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"><p className="font-display text-2xl font-bold text-emerald-800">All done! 🎉</p><p className="text-sm text-emerald-900">{stops.length} stop{stops.length === 1 ? "" : "s"} finished.</p></section>
      )}

      <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm"><input type="checkbox" checked={autoText} onChange={(e) => { setAutoText(e.target.checked); localStorage.setItem(PKEY, e.target.checked ? "1" : "0"); }} className="size-5" />When I finish a stop, text the next client “on my way”</label>
      <button onClick={() => setShowList(!showList)} className="flex w-full items-center justify-between rounded-xl bg-white p-3 text-sm font-semibold">All stops <ChevronDown className={`size-4 transition ${showList ? "rotate-180" : ""}`} /></button>
      {showList && (
        <ol className="space-y-1 rounded-xl bg-white p-2 text-sm">
          {stops.map((s, i) => <li key={s.visitId} className={`flex justify-between gap-2 rounded-lg px-2 py-1.5 ${s.visitId === cur?.visitId ? "bg-blue/10 font-semibold" : ""}`}><span>{i + 1}. {s.address}</span><span className="text-ink-soft">{s.state === "COMPLETED" ? "✓" : s.state === "SKIPPED" ? "skipped" : s.state === "EN_ROUTE" ? "on the way" : s.state === "IN_PROGRESS" ? "here" : ""}</span></li>)}
        </ol>
      )}
    </div>
  );
}
