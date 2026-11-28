"use client";
// Quote line editor (plain form fields, indexed names). Shows existing lines plus a few blank rows.
// Picking a price-book service by name fills that row's details and price when they are still empty.
// Options (good / better / best): name up to four, then say which option each line belongs to.
// A line can carry one photo (uploaded straight away; kept on the line when the quote is saved).
import { useState } from "react";
import { OPTION_KEYS, type QuoteOption } from "@/server/status/quote";
import { shrink } from "./photo-uploader";
import { inputCls } from "./ui";

type Service = { name: string; description: string | null; unitPriceCents: number | null };

type Line = { name: string; description?: string | null; quantity: number; unitPriceCents: number | null; isOptional: boolean; isSelected: boolean; optionKey?: string | null; photoId?: string | null };

/** `quoteId`: set once the quote exists, which is when line photos can be added. */
export function QuoteLinesEditor({ lines, services = [], options = [], quoteId }: { lines: Line[]; services?: Service[]; options?: QuoteOption[]; quoteId?: string }) {
  const [withOptions, setWithOptions] = useState(options.length > 0);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(options.map((o) => [o.key, o.name])));
  const [photos, setPhotos] = useState<Record<number, string | undefined>>(() => Object.fromEntries(lines.flatMap((l, i) => (l.photoId ? [[i, l.photoId]] : []))));
  const [status, setStatus] = useState("");
  const fill = (i: number, el: HTMLInputElement) => {
    const s = services.find((x) => x.name === el.value);
    const set = (k: string, v: string) => { const f = el.form?.elements.namedItem(`line_${i}_${k}`); if (f instanceof HTMLInputElement && !f.value) f.value = v; };
    if (s?.description) set("desc", s.description);
    if (s?.unitPriceCents != null) set("price", String(s.unitPriceCents / 100));
  };
  async function addPhoto(i: number, file?: File) {
    if (!file || !quoteId) return;
    setStatus("Uploading photo…");
    const body = new FormData();
    body.append("quoteId", quoteId);
    body.append("file", await shrink(file), file.name.replace(/\.\w+$/, "") + ".jpg");
    const res = await fetch("/api/uploads", { method: "POST", body }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok || !json?.ids?.[0]) return setStatus(json?.error ?? "Upload failed. Check your connection and try again.");
    setPhotos((p) => ({ ...p, [i]: json.ids[0] }));
    setStatus("Photo added. Save the quote to keep it.");
  }
  const label = (k: string) => names[k]?.trim() || `Option ${k.toUpperCase()}`;
  const rows: Line[] = [...lines, ...Array.from({ length: Math.max(3, 6 - lines.length) }, () => ({ name: "", quantity: 1, unitPriceCents: null, isOptional: false, isSelected: true }))];
  return (
    <div>
      <datalist id="quote-services">{services.map((s) => <option key={s.name} value={s.name} />)}</datalist>
      <label className="mb-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={withOptions} onChange={(e) => setWithOptions(e.target.checked)} className="size-4" /> Offer options to choose from (good / better / best)</label>
      {withOptions && (
        <div className="mb-3 space-y-2 rounded-xl bg-tint p-3">
          <div className="grid gap-2 xl:grid-cols-2">
            {OPTION_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <input name={`opt_${k}_name`} value={names[k] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value }))} maxLength={60} placeholder={`Option ${k.toUpperCase()} name`} className={inputCls} aria-label={`Option ${k.toUpperCase()} name`} />
                <label className="flex shrink-0 items-center gap-1 text-xs"><input type="radio" name="opt_recommended" value={k} defaultChecked={options.some((o) => o.key === k && o.recommended)} className="size-4" /> recommend</label>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs"><input type="radio" name="opt_recommended" value="" defaultChecked={!options.some((o) => o.recommended)} className="size-4" /> recommend none</label>
          <p className="text-xs text-ink-soft">Name two to four options, then pick an option on each line below. Lines left on &quot;Every option&quot; are part of all of them. The client must choose exactly one; until they do, the quote is valued at the recommended option (else the cheapest).</p>
        </div>
      )}
      <div className="hidden grid-cols-[1fr_4.5rem_6rem_5.5rem] gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid">
        <span>Item</span><span>Qty</span><span>Price $</span><span>Optional</span>
      </div>
      <div className="space-y-2">
        {rows.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_4.5rem_6rem_5.5rem] sm:border-0 sm:p-0">
            <div className="space-y-1">
              <input name={`line_${i}_name`} defaultValue={l.name} list="quote-services" onChange={(e) => fill(i, e.currentTarget)} placeholder={i < lines.length ? "" : "Add an item"} className={inputCls} />
              <input name={`line_${i}_desc`} defaultValue={l.description ?? ""} placeholder="Details (optional)" className={`${inputCls} min-h-9 text-sm`} />
              {(withOptions || quoteId) && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {withOptions && (
                    <select name={`line_${i}_option`} defaultValue={l.optionKey ?? ""} className="min-h-9 rounded-lg border border-line bg-white px-2" aria-label="Option this line belongs to">
                      <option value="">Every option</option>
                      {OPTION_KEYS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
                    </select>
                  )}
                  {quoteId && <input type="hidden" name={`line_${i}_photo`} value={photos[i] ?? ""} />}
                  {quoteId && (photos[i] ? (
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
                      <a href={`/api/media/${photos[i]}/lg`} target="_blank" rel="noreferrer"><img src={`/api/media/${photos[i]}/sm`} alt="Line photo" className="size-10 rounded-lg object-cover" /></a>
                      <button type="button" className="font-semibold text-ink-soft" onClick={() => setPhotos((p) => ({ ...p, [i]: undefined }))}>Remove photo</button>
                    </span>
                  ) : (
                    <label className="cursor-pointer font-semibold text-blue">📷 Add a photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => { void addPhoto(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                  ))}
                </div>
              )}
            </div>
            <input name={`line_${i}_qty`} type="number" step="0.25" min="0.25" defaultValue={l.quantity} className={inputCls} aria-label="Quantity" />
            <input name={`line_${i}_price`} type="number" step="0.01" min="0" defaultValue={l.unitPriceCents != null ? l.unitPriceCents / 100 : ""} className={inputCls} aria-label="Price" />
            <div className="col-span-3 flex items-center gap-3 text-sm sm:col-span-1 sm:flex-col sm:items-start sm:gap-1">
              <label className="flex items-center gap-1.5"><input type="checkbox" name={`line_${i}_optional`} defaultChecked={l.isOptional} className="size-4" /> optional</label>
              <label className="flex items-center gap-1.5 text-ink-soft"><input type="checkbox" name={`line_${i}_selected`} defaultChecked={l.isSelected} className="size-4" /> pre-ticked</label>
            </div>
          </div>
        ))}
      </div>
      {status && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{status}</p>}
      <p className="mt-2 text-xs text-ink-soft">Prices include tax. Optional items let the client add extras when approving (pre-ticked = recommended).{quoteId && " A line's photo shows beside it on the client's quote."}</p>
    </div>
  );
}
