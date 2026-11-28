"use client";
// Storm-day route runner: the next stop big, glove-sized buttons, navigation, photos. Works offline: stops are kept on
// the phone, and actions/photos queue up and send themselves when signal comes back.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ClipboardCheck, MapPin, Navigation, Phone, RotateCcw, SkipForward, TriangleAlert, Truck, WifiOff } from "lucide-react";
import type { RunStop } from "@/server/runner";

type Action = { id: string; visitId: string; to: "EN_ROUTE" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "RETURN"; depthCm?: number | null; iceMeltApplied?: boolean | null; iceMeltBags?: number | null; billable?: boolean; skipReason?: string; skipNote?: string; lat?: number | null; lng?: number | null };
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
  const [bags, setBags] = useState("");
  const [returnFor, setReturnFor] = useState<string | null>(null); // the done stop a return visit is being added after
  const [showList, setShowList] = useState(false);
  const [msg, setMsg] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [last, setLast] = useState<{ to: "COMPLETED" | "SKIPPED"; address: string } | null>(null); // the stop just finished, shown as feedback
  const cam = useRef<HTMLInputElement>(null);
  const camKind = useRef<"BEFORE" | "AFTER">("AFTER");

  const queue = (): Action[] => JSON.parse(localStorage.getItem(QKEY) || "[]");
  const countPending = useCallback(async () => setPending(queue().length + (await photoQueue("all").catch(() => [])).length), []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    let added = false;
    for (const a of queue()) {
      const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }).catch(() => null);
      if (!r) break; // still offline
      if (r.status === 401) { setMsg("Signed out. Open the app and sign in again to send your saved updates."); break; }
      if (r.ok || r.status === 409 || r.status === 404) localStorage.setItem(QKEY, JSON.stringify(queue().filter((x) => x.id !== a.id)));
      if (r.status === 409) setMsg((await r.json().catch(() => ({}))).error ?? "One action couldn't be applied");
      added ||= r.ok && a.to === "RETURN";
    }
    // A return visit is a new stop: fetch the day again so it shows up (only once nothing is waiting to send).
    if (added && !queue().length) {
      const [day, who] = [date.slice(0, 10), date.slice(11)];
      const fresh = await fetch(`/api/run?date=${day}${who === "all" ? "&who=all" : ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (fresh?.stops) { setStops(fresh.stops); localStorage.setItem(`etc-run-${date}`, JSON.stringify(fresh.stops)); }
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
  }, [countPending, date]);

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

  /** One more trip to a stop that's done (the plough buried the driveway end). It lands on today's route. */
  async function addReturn(s: RunStop, billable: boolean) {
    localStorage.setItem(QKEY, JSON.stringify([...queue(), { id: crypto.randomUUID(), visitId: s.visitId, to: "RETURN" as const, billable }]));
    setReturnFor(null);
    setMsg(`Return visit added for ${s.address}${navigator.onLine ? "" : " (shows up when you have signal)"}`);
    await countPending();
    void flush();
  }
  async function act(s: RunStop, to: Exclude<Action["to"], "RETURN">, extra: Partial<Action> = {}) {
    const pos = to === "COMPLETED" || to === "IN_PROGRESS" ? await where() : null;
    const a: Action = { id: crypto.randomUUID(), visitId: s.visitId, to, lat: pos?.lat ?? null, lng: pos?.lng ?? null, ...extra };
    const next = stops.map((x) => (x.visitId === s.visitId ? { ...x, state: to } : x));
    setStops(next);
    if (to === "COMPLETED" || to === "SKIPPED") { setLast({ to, address: s.address }); setMsg(""); }
    localStorage.setItem(cacheKey, JSON.stringify(next));
    localStorage.setItem(QKEY, JSON.stringify([...queue(), a]));
    // Finishing a stop can text the next client "on my way".
    if ((to === "COMPLETED" || to === "SKIPPED") && autoText) {
      const n = next.find((x) => !["COMPLETED", "SKIPPED"].includes(x.state));
      if (n && n.state === "SCHEDULED") { localStorage.setItem(QKEY, JSON.stringify([...queue(), { id: crypto.randomUUID(), visitId: n.visitId, to: "EN_ROUTE" as const }])); setStops(next.map((x) => (x.visitId === n.visitId ? { ...x, state: "EN_ROUTE" } : x))); }
    }
    setDepth(""); setIceMelt(false); setBags("");
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
  // Night presentation (the runner is used before dawn): white on navy, one emerald "Done", amber for anything to watch.
  const tileBase = "flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-base font-semibold hover:bg-white/10 active:bg-white/15 focus-visible:outline-sky";
  const tile = `${tileBase} border-white/20 bg-white/[0.06] text-white`;
  const tileNext = `${tileBase} border-sky bg-sky/10 text-sky`; // the step that comes next in the sequence
  const field = "h-14 w-full rounded-xl border border-white/25 bg-white px-3 text-xl text-night tabular-nums focus-visible:outline-sky";
  const stateWord = (s: string) => (s === "COMPLETED" ? "Done" : s === "SKIPPED" ? "Skipped" : s === "EN_ROUTE" ? "On the way" : s === "IN_PROGRESS" ? "On site" : "");
  return (
    <div className="mx-auto max-w-lg space-y-3 text-white">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm tabular-nums text-white/70">
          <span>{cur ? `Stop ${done + 1} of ${stops.length}` : `All ${stops.length} done`}{cur && <span className="text-white/60"> · {done} finished</span>}</span>
          <span role="status" className={`inline-flex items-center gap-1.5 ${online ? "" : "font-semibold text-amber-300"}`}>
            {online ? <span className={`size-2 rounded-full ${pending > 0 ? "bg-sky" : "bg-emerald-400"}`} aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
            {online ? (pending > 0 ? `Sending ${pending} saved update${pending === 1 ? "" : "s"}…` : "Online") : pending > 0 ? `No signal · ${pending} saved on this phone` : "No signal · saves on this phone"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Stops finished" aria-valuemin={0} aria-valuemax={stops.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} />
        </div>
      </div>
      {last && (
        <p className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${last.to === "COMPLETED" ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" : "border-white/20 bg-white/10 text-white"}`} aria-live="polite">
          {last.to === "COMPLETED" ? <Check className="size-4 shrink-0" aria-hidden /> : <SkipForward className="size-4 shrink-0" aria-hidden />}
          <span className="min-w-0">{last.to === "COMPLETED" ? "Done" : "Skipped"}: {last.address}</span>
        </p>
      )}
      {msg && <p className="rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium" aria-live="polite">{msg}</p>}

      {cur ? (
        <section className="rounded-2xl border border-white/10 bg-navy p-4" aria-label={`Stop ${done + 1} of ${stops.length}`}>
          <div className="flex items-start justify-between gap-2 text-sm font-medium text-sky">
            <p>{[cur.time, cur.communityName].filter(Boolean).join(" · ") || "Next stop"}</p>
            {stateWord(cur.state) && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky/20 px-2.5 py-0.5 text-xs font-semibold"><span className="size-1.5 rounded-full bg-sky" aria-hidden />{stateWord(cur.state)}</span>}
          </div>
          <h2 className="mt-1 font-display text-[1.9rem] font-semibold leading-[1.15] text-white [overflow-wrap:anywhere]">{cur.address}</h2>
          <p className="mt-1.5 text-base text-white/80">{cur.client} · {cur.job}{cur.usualMin != null && <span className="text-white/60"> · usually {cur.usualMin} min</span>}</p>

          {(cur.sizeNote || cur.gate || cur.access || cur.pets || cur.hazards) && (
            <div className="mt-3 flex gap-2.5 rounded-xl bg-amber-300 p-3 text-base text-amber-950">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <ul className="min-w-0 space-y-1.5 font-medium">
                {cur.sizeNote && <li className="font-semibold">{cur.sizeNote}</li>}
                {cur.gate && <li><span className="font-semibold">Gate:</span> {cur.gate}</li>}{cur.access && <li>{cur.access}</li>}{cur.pets && <li><span className="font-semibold">Pets:</span> {cur.pets}</li>}{cur.hazards && <li><span className="font-semibold">Careful:</span> {cur.hazards}</li>}
              </ul>
            </div>
          )}
          {cur.isReturn && <p className="mt-3 rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm font-medium">Return visit: we&apos;ve already been here this storm. Clear what came back (usually the driveway end).</p>}
          {cur.extras?.length > 0 && <p className="mt-3 rounded-xl border border-sky/40 bg-sky/10 p-3 text-sm font-medium">Also this visit: {cur.extras.join(", ")}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={nav(cur)} target="_blank" rel="noreferrer" className={`${tile} ${cur.phone ? "" : "col-span-2"}`}><Navigation className="size-5" aria-hidden />Navigate</a>
            {cur.phone && <a href={`tel:${cur.phone}`} className={tile}><Phone className="size-5" aria-hidden />Call</a>}
            <button type="button" onClick={() => { camKind.current = "BEFORE"; cam.current?.click(); }} className={tile}><Camera className="size-5" aria-hidden />Before photo</button>
            <button type="button" onClick={() => { camKind.current = "AFTER"; cam.current?.click(); }} className={tile}><Camera className="size-5" aria-hidden />After photo</button>
            {cur.more && <a href={`/stop/${cur.visitId}`} className={`${tile} col-span-2`}><ClipboardCheck className="size-5" aria-hidden />Checklist and signature</a>}
          </div>
          <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => addPhoto(e.target.files)} />

          <div className="mt-4 border-t border-white/10 pt-4">
            {(cur.state === "SCHEDULED" || cur.state === "EN_ROUTE") && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {cur.state === "SCHEDULED" && <button type="button" onClick={() => act(cur, "EN_ROUTE")} className={tileNext}><Truck className="size-5" aria-hidden />On my way</button>}
                <button type="button" onClick={() => act(cur, "IN_PROGRESS")} className={cur.state === "EN_ROUTE" ? `${tileNext} col-span-2` : tile}><MapPin className="size-5" aria-hidden />Arrived</button>
              </div>
            )}
            {cur.snow && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <label className="block text-sm font-medium text-white/80">Snow depth (cm)
                  <input inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))} placeholder="cm" className={`${field} mt-1`} /></label>
                <div>
                  <span className="block text-sm font-medium text-white/80" aria-hidden>Ice melt</span>
                  <label className={`${tileBase} mt-1 justify-start text-white ${iceMelt ? "border-emerald-400 bg-emerald-400/15" : "border-white/20 bg-white/[0.06]"}`}><input type="checkbox" checked={iceMelt || false} onChange={(e) => setIceMelt(e.target.checked)} className="size-6 accent-emerald-400" />Put down</label>
                </div>
                {iceMelt && <label className="col-span-2 block text-sm font-medium text-white/80">Bags of ice melt used
                  <input inputMode="decimal" value={bags} onChange={(e) => setBags(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.5" className={`${field} mt-1`} /></label>}
              </div>
            )}
            <button type="button" onClick={() => act(cur, "COMPLETED", { depthCm: depth ? Number(depth) : null, iceMeltApplied: cur.snow ? iceMelt : null, iceMeltBags: cur.snow && iceMelt && Number(bags) > 0 ? Math.min(999, Number(bags)) : null })}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-xl font-semibold text-night hover:bg-emerald-300 active:bg-emerald-500 focus-visible:outline-white"><Check className="size-6" aria-hidden />Done</button>
          </div>

          <details className="group mt-3">
            <summary className="flex min-h-12 list-none items-center justify-center gap-2 rounded-xl text-base font-medium text-white/75 hover:bg-white/5 hover:text-white focus-visible:outline-sky"><SkipForward className="size-4" aria-hidden />Skip this stop<ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden /></summary>
            <p className="mt-2 text-sm text-white/70">Pick why. The office sees the reason and your note.</p>
            <input value={skipNote} onChange={(e) => setSkipNote(e.target.value)} maxLength={500} placeholder="Note for the office (optional)" aria-label="Note for the office (optional)" className="mt-2 min-h-12 w-full rounded-xl border border-white/25 bg-white px-3 text-base text-night focus-visible:outline-sky" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[["ALREADY_CLEARED", "Already clear"], ["BLOCKED_BY_CAR", "Car in the way"], ["NO_ACCESS", "Can't get in"], ["CLIENT_CANCELLED", "Client cancelled"], ["OTHER", "Too big for the price"]].map(([k, l]) => (
                <button type="button" key={k} onClick={() => { act(cur, "SKIPPED", { skipReason: k, ...(skipNote.trim() ? { skipNote: skipNote.trim() } : {}) }); setSkipNote(""); }} className={`${tile} text-center leading-tight last:odd:col-span-2`}>{l}</button>
              ))}
            </div>
          </details>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-400/40 bg-emerald-400/15 p-6 text-center">
          <Check className="mx-auto size-8 text-emerald-300" aria-hidden />
          <p className="mt-2 font-display text-2xl font-semibold text-white">All done</p>
          <p className="mt-1 text-base tabular-nums text-white/80">{stops.length} stop{stops.length === 1 ? "" : "s"} finished.</p>
        </section>
      )}

      <label className="flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-navy px-4 py-3 text-sm text-white/90"><input type="checkbox" checked={autoText} onChange={(e) => { setAutoText(e.target.checked); localStorage.setItem(PKEY, e.target.checked ? "1" : "0"); }} className="size-6 shrink-0 accent-emerald-400" />When I finish a stop, text the next client “on my way”</label>
      <button type="button" onClick={() => setShowList(!showList)} aria-expanded={showList} className="flex min-h-14 w-full items-center justify-between rounded-xl border border-white/10 bg-navy px-4 text-base font-semibold text-white hover:bg-white/10 focus-visible:outline-sky">
        <span>All stops <span className="font-normal tabular-nums text-white/60">({stops.length})</span></span><ChevronDown className={`size-5 transition ${showList ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {showList && (
        <ol className="divide-y divide-white/10 rounded-xl border border-white/10 bg-navy text-sm">
          {stops.map((s, i) => (
            <li key={s.visitId} className={`px-4 py-3 ${s.visitId === cur?.visitId ? "bg-white/10" : ""}`} aria-current={s.visitId === cur?.visitId ? "step" : undefined}>
              <div className="flex items-start justify-between gap-3">
                <span className={`min-w-0 ${s.visitId === cur?.visitId ? "font-semibold text-white" : s.state === "COMPLETED" || s.state === "SKIPPED" ? "text-white/60" : "text-white/90"}`}><span className="tabular-nums">{i + 1}.</span> {s.address}{s.isReturn && " (return visit)"}{s.usualMin != null && <span className="font-normal text-white/60"> · usually {s.usualMin} min</span>}</span>
                {stateWord(s.state) && <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${s.state === "COMPLETED" ? "text-emerald-300" : s.state === "SKIPPED" ? "text-white/60" : "text-sky"}`}>{s.state === "COMPLETED" && <Check className="size-3.5" aria-hidden />}{stateWord(s.state)}</span>}
              </div>
              {/* Done storm stops can get one more trip. Crew pick whether it's billable; the office sets what that costs. */}
              {s.state === "COMPLETED" && s.storm && (returnFor === s.visitId ? (
                <div className="mt-2">
                  <p className="mb-2 text-sm text-white/80">Return visit for this address:</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => addReturn(s, false)} className={tile}>Included</button>
                    <button type="button" onClick={() => addReturn(s, true)} className={tile}>Billable</button>
                    <button type="button" onClick={() => setReturnFor(null)} className="min-h-14 rounded-xl text-base font-medium text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-sky">Cancel</button>
                  </div>
                </div>
              ) : <button type="button" onClick={() => setReturnFor(s.visitId)} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-sky hover:text-white focus-visible:outline-sky"><RotateCcw className="size-4" aria-hidden />Plough came back? Add a return visit</button>)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
