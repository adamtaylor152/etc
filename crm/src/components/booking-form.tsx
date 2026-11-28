"use client";
// The CRM's own booking form (app.etccrew.ca/book). Posts to the same /api/public/bookings as etccrew.ca's wizard,
// so validation, pricing and emails are identical. Services and prices come from the price book.
// The client hub reuses it (`hub`): the client is already known, so it asks which of their addresses instead of who
// they are, and sends the order through a token-checked server action that runs the same booking pipeline.
import { useEffect, useState } from "react";
import type { WindowKey } from "@/server/windows";
import { AddressField } from "./address-field";
import { shrink } from "./photo-uploader";

type Service = { label: string; description?: string | null; price: string | null };
type Slots = { windows: { key: WindowKey; label: string; hint: string }[]; days: { date: string; windows: WindowKey[] }[] };
export type HubOrderResult = { ok: false; error: string; slotTaken?: boolean } | { ok: true; id: number; estimate: string; uploadUrl?: string; lines: string[]; next: string };
export type HubOrder = {
  back: string; payment: string; properties: { id: string; address: string; size: string | null }[]; // size null = nobody has said yet, so ask
  prefill?: { services: string[]; propertyId?: string; note?: string };
  order: (data: Record<string, unknown>) => Promise<HubOrderResult>;
};
const dayName = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });

export function BookingForm({ services, phone, mapsKey, refCode, hub }: { services: Service[]; phone: string; mapsKey?: string; refCode?: string; hub?: HubOrder }) {
  // Open times for the look-and-quote visit. ponytail: arrival windows only; the API also takes exact start times.
  const [slots, setSlots] = useState<Slots | null>(null);
  const [slot, setSlot] = useState<{ date: string; window: WindowKey } | null>(null);
  const [dayPick, setDayPick] = useState<string | null>(null);
  const loadSlots = () => fetch("/api/public/slots", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setSlots).catch(() => setSlots(null));
  useEffect(() => { void loadSlots(); }, []);
  const [picked, setPicked] = useState<string[]>(hub?.prefill?.services ?? []);
  const [where, setWhere] = useState(hub?.prefill?.propertyId ?? hub?.properties[0]?.id ?? "new");
  const known = hub?.properties.find((p) => p.id === where)?.size ?? null; // this address already has a driveway size
  const [plan, setPlan] = useState("One-time visit");
  const [size, setSize] = useState("Standard");
  const [photos, setPhotos] = useState<File[]>([]);
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; msg?: string; upload?: string; estimate?: string; id?: number; sent?: number; unsent?: number; lines?: string[]; next?: string }>({ status: "idle" });
  const shovel = picked.includes("Snow shovelling");
  const quoted = picked.some((s) => s !== "Snow shovelling") || (shovel && (known ?? size) === "Oversized"); // same rule as the server
  const assess = picked.some((s) => s !== "Snow shovelling"); // these get an on-site look first (same rule as the server)
  const days = (slots?.days ?? []).filter((d) => d.windows.length);
  const pickTime = assess && days.length > 0;
  const day = days.find((d) => d.date === dayPick) ?? days[0];
  const input = "w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-base";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!picked.length) return setState({ status: "error", msg: "Pick at least one service." });
    setState({ status: "sending" });
    const body = {
      ...(hub && where !== "new" ? { propertyId: where } : {
        name: f.get("name"), email: f.get("email"), phone: f.get("phone"), address: f.get("formatted"), access: f.get("access"),
        // set only when they picked a suggestion from the address list
        ...(f.get("lat") ? { lat: Number(f.get("lat")), lng: Number(f.get("lng")), placeId: f.get("placeId"), postalCode: f.get("postalCode") } : {}),
      }),
      services: picked, plan: shovel ? plan : "", icemelt: shovel && f.get("icemelt") === "on",
      size: shovel ? f.get("size") : undefined, extraWalk: shovel && f.get("extraWalk") === "on",
      date: shovel && plan === "Every snowfall" ? "" : f.get("date"), notes: f.get("notes"), payment: f.get("payment"), website: f.get("website"), smsOptIn: f.get("smsOptIn") === "on",
      offers: f.get("offers") === "on", ...(refCode ? { ref: refCode } : {}), ...(pickTime && slot ? { slot } : {}),
    };
    const res = hub ? null : await fetch("/api/public/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = hub ? await hub.order(body).catch(() => null) : await res?.json().catch(() => ({}));
    if (data?.slotTaken) { setSlot(null); void loadSlots(); }
    if (!(hub ? data?.ok : res?.ok)) return setState({ status: "error", msg: `${data?.error ?? "Couldn't reach us."} You can also call ${phone}.` });
    // Quote jobs come back with a photo link: send the photos they picked through it, one at a time.
    const send = quoted && data.uploadUrl ? photos : [];
    let sent = 0;
    for (const [i, p] of send.entries()) {
      setState({ status: "sending", msg: `Sending photo ${i + 1} of ${send.length}…` });
      const fd = new FormData();
      fd.append("file", await shrink(p), "photo.jpg");
      const r = await fetch(new URL(data.uploadUrl).pathname.replace(/^\/u\//, "/api/public/uploads/"), { method: "POST", body: fd }).catch(() => null);
      if (!r?.ok) break; // booking is in; the done screen links to the photo page for the rest
      sent++;
    }
    setState({ status: "done", upload: data.uploadUrl, estimate: data.estimate, id: data.id, sent, unsent: send.length - sent, lines: data.lines, next: data.next });
  }

  if (state.status === "done") {
    return (
      <div className="rounded-3xl border border-line bg-white p-6 text-center">
        <div className="text-5xl">🙌</div>
        <h2 className="mt-2 font-display text-2xl font-bold">Thanks, neighbour! Booking #{state.id} is in.</h2>
        {state.lines && <ul className="mt-3 rounded-xl bg-tint p-3 text-left text-sm">{state.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        <p className="mt-2 text-ink-soft">Estimate: <b>{state.estimate}</b> (tax included). {state.next ?? "A confirmation is on its way, and Silas will be in touch to lock in a time."}</p>
        {!!state.sent && <p className="mt-2 text-ink-soft">📸 Got your {state.sent} photo{state.sent === 1 ? "" : "s"}, thanks!</p>}
        {!!state.unsent && <p className="mt-2 font-semibold text-amber-800">{state.unsent} photo{state.unsent === 1 ? "" : "s"} didn&apos;t send. Use the button below to try again.</p>}
        {state.upload && <a href={state.upload} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-blue px-6 font-semibold text-white">{state.sent ? "Add more photos" : "Send us photos for a faster quote"}</a>}
        {hub && <a href={hub.back} className="mt-3 flex min-h-12 items-center justify-center rounded-full border-2 border-line font-semibold">Back to your page</a>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-line bg-white p-5 sm:p-6">
      {hub ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-display text-lg font-bold">Where?</legend>
          {[...hub.properties, { id: "new", address: "A different address" }].map((p) => (
            <label key={p.id} className={`flex min-h-12 items-center gap-2 rounded-xl border p-3 ${where === p.id ? "border-blue bg-blue/5" : "border-line"}`}>
              <input type="radio" name="where" checked={where === p.id} onChange={() => setWhere(p.id)} className="size-5" /> {p.address}
            </label>
          ))}
          {where === "new" && <>
            <div className="text-sm font-semibold">Address<AddressField mapsKey={mapsKey} /></div>
            <label className="block text-sm font-semibold">Access notes (optional)<input name="access" maxLength={300} placeholder="Side gate code, dog in the yard…" className={input} /></label>
          </>}
        </fieldset>
      ) : (
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-bold">About you</legend>
        <label className="text-sm font-semibold">Name<input name="name" required maxLength={100} autoComplete="name" className={input} /></label>
        <label className="text-sm font-semibold">Email<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className="text-sm font-semibold">Phone (optional)<input name="phone" type="tel" autoComplete="tel" className={input} />
          <span className="mt-1 flex items-center gap-2 font-normal text-ink-soft"><input type="checkbox" name="smsOptIn" className="size-4" /> Text me when you&apos;re on the way &amp; done</span></label>
        <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2"><input type="checkbox" name="offers" className="size-4" /> Email me seasonal offers from etc. (a few a year; unsubscribe any time)</label>
        <div className="text-sm font-semibold sm:col-span-2">Address<AddressField mapsKey={mapsKey} /></div>
        <label className="text-sm font-semibold sm:col-span-2">Access notes (optional)<input name="access" maxLength={300} placeholder="Side gate code, dog in the yard…" className={input} /></label>
      </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 font-display text-lg font-bold">What do you need?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.label} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${picked.includes(s.label) ? "border-blue bg-blue/5" : "border-line"}`}>
              <span className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(s.label)} className="size-5"
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.label] : p.filter((x) => x !== s.label)))} />
                <span>{s.label}{s.description && <span className="block text-sm text-ink-soft">{s.description}</span>}</span></span>
              <span className="text-sm text-ink-soft">{s.price ?? "Quote"}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {shovel && (
        <fieldset className="space-y-2 rounded-2xl bg-tint p-4">
          <legend className="font-semibold">Snow shovelling</legend>
          {["One-time visit", "Every snowfall"].map((p) => (
            <label key={p} className="flex items-center gap-2"><input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} className="size-5" /> {p}{p === "Every snowfall" && <span className="text-sm text-ink-soft"> ($5 off every time)</span>}</label>
          ))}
          {!known && <><p className="pt-1 text-sm font-semibold">How big is the driveway?</p>
          {[["Standard", "1–2 car, front walk and steps"], ["Large", "3 car, extra long or wide (+$15)"], ["Oversized", "Acreage, back lane, shared or commercial (we'll quote)"]].map(([v, d]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="size" value={v} checked={size === v} onChange={() => setSize(v)} className="size-5" /> <span><b>{v}</b> <span className="text-sm text-ink-soft">{d}</span></span></label>
          ))}
          <label className="flex items-center gap-2"><input type="checkbox" name="extraWalk" className="size-5" /> Corner lot or extra sidewalk (+$10)</label></>}
          <label className="flex items-center gap-2"><input type="checkbox" name="icemelt" className="size-5" /> Add ice melt (+$5)</label>
          {!known && <p className="text-xs text-ink-soft">Prices are for the size you pick. We check every driveway on the map before the first visit; if it&apos;s bigger, we&apos;ll send you the right price to OK first.</p>}
        </fieldset>
      )}
      {pickTime && day && (
        <fieldset>
          <legend className="font-semibold">When can we come take a look? (optional)</legend>
          <p className="mb-2 text-sm text-ink-soft">We&apos;ll come by, see the job and give you a price.</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => <button key={d.date} type="button" aria-pressed={d.date === day.date} onClick={() => { setDayPick(d.date); setSlot(null); }}
              className={`flex-none rounded-xl border px-3 py-2 text-sm ${d.date === day.date ? "border-blue bg-blue/5 font-semibold" : "border-line"}`}>{dayName(d.date)}</button>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots!.windows.filter((w) => day.windows.includes(w.key)).map((w) => (
              <label key={w.key} className={`rounded-xl border px-3 py-2 text-sm ${slot?.date === day.date && slot.window === w.key ? "border-blue bg-blue/5 font-semibold" : "border-line"}`}>
                <input type="radio" name="slotWindow" className="sr-only" checked={slot?.date === day.date && slot.window === w.key} onChange={() => setSlot({ date: day.date, window: w.key })} />
                {w.label} <span className="font-normal text-ink-soft">{w.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!(shovel && plan === "Every snowfall") && !(pickTime && !shovel) && <label className="block text-sm font-semibold">Preferred date (optional)<input name="date" type="date" className={input} /></label>}
      {quoted && (
        <label className="block text-sm font-semibold">Photos of the job (optional, up to 20)
          <span className="block font-normal text-ink-soft">The whole area, close-ups of the tricky bits, and how we get there. We can often quote from photos alone.</span>
          <input type="file" accept="image/*" multiple className={input} onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, 20))} />
          {photos.length > 0 && <span className="mt-1 block font-normal text-ink-soft">{photos.length} photo{photos.length === 1 ? "" : "s"} ready to send</span>}
        </label>
      )}
      <label className="block text-sm font-semibold">Anything else? (optional)<textarea name="notes" rows={3} maxLength={2000} defaultValue={hub?.prefill?.note} className={input} /></label>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 font-semibold">Pay after the job by</legend>
        <label className="flex items-center gap-2"><input type="radio" name="payment" value="e-Transfer" defaultChecked={hub?.payment !== "Cash"} className="size-5" /> e-Transfer</label>
        <label className="flex items-center gap-2"><input type="radio" name="payment" value="Cash" defaultChecked={hub?.payment === "Cash"} className="size-5" /> Cash</label>
      </fieldset>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.msg}</p>}
      <button disabled={state.status === "sending"} className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white disabled:opacity-50">{state.status === "sending" ? state.msg ?? "Sending…" : hub ? "Send order" : "Send booking"}</button>
    </form>
  );
}
