"use client";
// Quote line editor (plain form fields, indexed names). Shows existing lines plus a few blank rows.
// Picking a price-book service by name fills that row's details and price when they are still empty.
// Options (good / better / best): name up to four, then say which option each line belongs to.
// A line can carry one photo (uploaded straight away; kept on the line when the quote is saved).
import { useState } from "react";
import { OPTION_KEYS, type QuoteOption } from "@/server/status/quote";
import { Camera } from "lucide-react";
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
  // Phones: name and details across the top, then quantity, price and the optional ticks on one row. From `sm`: one row per line.
  const grid = "grid grid-cols-[4.5rem_minmax(0,6.5rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem]";
  const mini = "mb-0.5 block text-xs font-medium text-ink-soft sm:hidden";
  const tick = "flex min-h-7 items-center gap-1.5 text-[13px]";
  const blankHide = "max-sm:group-has-[.line-name:placeholder-shown]/line:hidden"; // phones: an unnamed line is just its name box
  // A line with no name yet shows only its name, quantity and price (CSS :placeholder-shown): the rest appears once it is named.
  return (
    <div>
      <datalist id="quote-services">{services.map((s) => <option key={s.name} value={s.name} />)}</datalist>
      <div className="mb-2 flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">Line items</span><span className="text-xs text-ink-soft">Prices include tax</span></div>
      <label className="mb-3 flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" checked={withOptions} onChange={(e) => setWithOptions(e.target.checked)} className="size-4 shrink-0" />Offer options to choose from (good / better / best)</label>
      {withOptions && (
        <fieldset className="mb-4 space-y-2 rounded-lg bg-tint p-3">
          <legend className="sr-only">Options</legend>
          <div className="grid gap-2 xl:grid-cols-2">
            {OPTION_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <input name={`opt_${k}_name`} value={names[k] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value }))} maxLength={60} placeholder={`Option ${k.toUpperCase()} name`} className={inputCls} aria-label={`Option ${k.toUpperCase()} name`} />
                <label className={`${tick} shrink-0`}><input type="radio" name="opt_recommended" value={k} defaultChecked={options.some((o) => o.key === k && o.recommended)} className="size-4" />Recommend</label>
              </div>
            ))}
          </div>
          <label className={tick}><input type="radio" name="opt_recommended" value="" defaultChecked={!options.some((o) => o.recommended)} className="size-4" />Recommend none</label>
          <p className="max-w-[70ch] text-xs text-ink-soft">Name two to four options, then pick an option on each line below. Lines left on &quot;Every option&quot; are part of all of them. The client must choose exactly one; until they do, the quote is valued at the recommended option (else the cheapest).</p>
        </fieldset>
      )}
      <div className={`hidden border-b border-line pb-1.5 text-xs font-medium text-ink-soft ${grid} sm:grid`}>
        <span>Item</span><span>Qty</span><span>Price ($)</span><span>Optional extra</span>
      </div>
      <div className="divide-y divide-line-soft border-b border-line-soft">
        {rows.map((l, i) => (
          <div key={i} className={`group/line ${grid} py-3 has-[.line-name:placeholder-shown]:py-2 sm:items-start`}>
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <input name={`line_${i}_name`} defaultValue={l.name} list="quote-services" onChange={(e) => fill(i, e.currentTarget)} placeholder={i < lines.length ? "Item name" : "Add an item"} aria-label={`Item ${i + 1} name`} className={`line-name ${inputCls}`} />
              <input name={`line_${i}_desc`} defaultValue={l.description ?? ""} placeholder="Details (optional)" aria-label={`Item ${i + 1} details`} className="w-full min-h-9 max-sm:min-h-11 group-has-[.line-name:placeholder-shown]/line:hidden rounded-lg border border-line bg-white px-3 py-1.5 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-[13px]" />
              {(withOptions || quoteId) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] group-has-[.line-name:placeholder-shown]/line:hidden">
                  {withOptions && (
                    <select name={`line_${i}_option`} defaultValue={l.optionKey ?? ""} className="min-h-9 max-w-full rounded-lg border border-line bg-white px-2 text-base hover:border-ink-faint/60 sm:text-[13px]" aria-label="Option this line belongs to">
                      <option value="">Every option</option>
                      {OPTION_KEYS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
                    </select>
                  )}
                  {quoteId && <input type="hidden" name={`line_${i}_photo`} value={photos[i] ?? ""} />}
                  {quoteId && (photos[i] ? (
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
                      <a href={`/api/media/${photos[i]}/lg`} target="_blank" rel="noreferrer"><img src={`/api/media/${photos[i]}/sm`} alt="Line photo" className="size-10 rounded-lg border border-line object-cover" /></a>
                      <button type="button" className="min-h-8 rounded-md font-medium text-ink-soft hover:text-red-700" onClick={() => setPhotos((p) => ({ ...p, [i]: undefined }))}>Remove photo</button>
                    </span>
                  ) : (
                    <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md font-semibold text-blue hover:text-blue-deep has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue"><Camera className="size-4" aria-hidden />Add a photo<input type="file" accept="image/*" className="sr-only" onChange={(e) => { void addPhoto(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                  ))}
                </div>
              )}
            </div>
            <label className={`block ${blankHide}`}><span className={mini}>Qty</span><input name={`line_${i}_qty`} type="number" step="0.25" min="0.25" defaultValue={l.quantity} className={`${inputCls} tabular-nums`} aria-label="Quantity" /></label>
            <label className={`block ${blankHide}`}><span className={mini}>Price ($)</span><input name={`line_${i}_price`} type="number" step="0.01" min="0" defaultValue={l.unitPriceCents != null ? l.unitPriceCents / 100 : ""} className={`${inputCls} tabular-nums`} aria-label="Price" /></label>
            <div className="self-end group-has-[.line-name:placeholder-shown]/line:hidden sm:self-start sm:pt-1">
              <label className={tick} title="The client can add this when approving"><input type="checkbox" name={`line_${i}_optional`} defaultChecked={l.isOptional} className="size-4" />Optional</label>
              <label className={`${tick} text-ink-soft`} title="Ticked for the client to start with (recommended)"><input type="checkbox" name={`line_${i}_selected`} defaultChecked={l.isSelected} className="size-4" />Pre-ticked</label>
            </div>
          </div>
        ))}
      </div>
      {status && <p className="mt-2 text-sm font-medium text-ink-soft" role="status" aria-live="polite">{status}</p>}
      <p className="mt-2 max-w-[70ch] text-xs text-ink-soft">Leave spare lines blank; details and the optional ticks appear once a line has a name. Optional items let the client add extras when approving (pre-ticked = recommended).{quoteId && " A line's photo shows beside it on the client's quote."}</p>
    </div>
  );
}
