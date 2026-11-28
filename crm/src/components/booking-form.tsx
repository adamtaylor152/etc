"use client";
// The CRM's own booking form (app.etccrew.ca/book). Posts to the same /api/public/bookings as etccrew.ca's wizard,
// so validation, pricing and emails are identical. Services and prices come from the price book.
// The client hub reuses it (`hub`): the client is already known, so it asks which of their addresses instead of who
// they are, and sends the order through a token-checked server action that runs the same booking pipeline.
// Layout: one page of numbered steps (what, when, where/who, anything else), each its own card, then a short
// "check and send" summary above the one button. Every field stays mounted, so the payload is the same as ever.
import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { AddressField } from "./address-field";
import { shrink } from "./photo-uploader";
import { cta } from "./public/kit";
import { inputCls } from "./ui";
import { prettyPhone } from "./phone";

type Service = { label: string; description?: string | null; price: string | null };
type Slots = { windows: { key: string; label: string; hint: string }[]; days: { date: string; windows: string[] }[] };
export type HubOrderResult = { ok: false; error: string; slotTaken?: boolean } | { ok: true; id: number; estimate: string; uploadUrl?: string; lines: string[]; next: string };
export type HubOrder = {
  back: string; payment: string; properties: { id: string; address: string; size: string | null }[]; // size null = nobody has said yet, so ask
  prefill?: { services: string[]; propertyId?: string; note?: string };
  order: (data: Record<string, unknown>) => Promise<HubOrderResult>;
};
const dayName = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
const dayPart = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00`).toLocaleDateString("en-CA", o);

const field = `${inputCls} min-h-12`;
const labelCls = "mb-1 block font-semibold";
// A choice you tap anywhere on: the row lights up when its box or dot is on.
const choice = "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-3.5 py-2.5 hover:border-ink-faint/60 has-[:checked]:border-blue has-[:checked]:bg-blue/5";
const SIZE_OPTIONS = [["Standard", "1–2 car, front walk and steps"], ["Large", "3 car, extra long or wide (+$15)"], ["Oversized", "Acreage, back lane, shared or commercial (we'll quote)"]];

/** One numbered step of the form: a card with "2 · When" and where you are ("Step 2 of 4"). */
function Step({ n, of, title, hint, children, id }: { n: number; of: number; title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="min-w-0 scroll-mt-4 rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
      <legend className="sr-only">Step {n} of {of}: {title}</legend>
      <div className="mb-3 flex items-center gap-3" aria-hidden>
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-tint font-display font-semibold tabular-nums">{n}</span>
        <span className="min-w-0 flex-1 font-display text-lg font-semibold leading-tight">{title}</span>
        <span className="shrink-0 text-sm text-ink-soft tabular-nums">Step {n} of {of}</span>
      </div>
      {hint && <p className="-mt-1 mb-3 text-ink-soft">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function BookingForm({ services, phone, mapsKey, refCode, utm, hub }: { services: Service[]; phone: string; mapsKey?: string; refCode?: string; utm?: string; hub?: HubOrder }) {
  // Open times for the look-and-quote visit. ponytail: arrival windows only; the API also takes exact start times.
  const [slots, setSlots] = useState<Slots | null>(null);
  const [slot, setSlot] = useState<{ date: string; window: string } | null>(null);
  const [dayPick, setDayPick] = useState<string | null>(null);
  const loadSlots = () => fetch("/api/public/slots", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setSlots).catch(() => setSlots(null));
  useEffect(() => { void loadSlots(); }, []);
  const [picked, setPicked] = useState<string[]>(hub?.prefill?.services ?? []);
  const [where, setWhere] = useState(hub?.prefill?.propertyId ?? hub?.properties[0]?.id ?? "new");
  const known = hub?.properties.find((p) => p.id === where)?.size ?? null; // this address already has a driveway size
  const [plan, setPlan] = useState("One-time visit");
  const [size, setSize] = useState("Standard");
  const [photos, setPhotos] = useState<File[]>([]);
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; msg?: string; at?: "services"; upload?: string; estimate?: string; id?: number; sent?: number; unsent?: number; lines?: string[]; next?: string }>({ status: "idle" });
  const shovel = picked.includes("Snow shovelling");
  const quoted = picked.some((s) => s !== "Snow shovelling") || (shovel && (known ?? size) === "Oversized"); // same rule as the server
  const assess = picked.some((s) => s !== "Snow shovelling"); // these get an on-site look first (same rule as the server)
  const days = (slots?.days ?? []).filter((d) => d.windows.length);
  const pickTime = assess && days.length > 0;
  const day = days.find((d) => d.date === dayPick) ?? days[0];
  const showTimes = pickTime && !!day;
  const showDate = !(shovel && plan === "Every snowfall") && !(pickTime && !shovel);
  const hasWhen = showTimes || showDate;
  const steps = hasWhen ? 4 : 3;
  const at = { what: 1, when: 2, who: hasWhen ? 3 : 2, more: hasWhen ? 4 : 3 };
  const needService = state.status === "error" && state.at === "services" && !picked.length;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!picked.length) {
      document.getElementById("book-what")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return setState({ status: "error", msg: "Pick at least one service.", at: "services" });
    }
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
      offers: f.get("offers") === "on", ...(refCode ? { ref: refCode } : {}), ...(utm ? { utm } : {}), ...(pickTime && slot ? { slot } : {}),
    };
    const res = hub ? null : await fetch("/api/public/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = hub ? await hub.order(body).catch(() => null) : await res?.json().catch(() => ({}));
    if (data?.slotTaken) { setSlot(null); void loadSlots(); }
    if (!(hub ? data?.ok : res?.ok)) return setState({ status: "error", msg: `${data?.error ?? "Couldn't reach us."} You can also call ${prettyPhone(phone)}.` });
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
      <section role="status" className="rounded-xl border border-line bg-white p-5 shadow-card sm:p-6">
        <CircleCheck className="size-9 text-emerald-600" strokeWidth={1.75} aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-semibold leading-tight">Thanks, neighbour. Booking #{state.id} is in.</h2>
        <p className="mt-2 text-ink-soft">{state.next ?? "A confirmation is on its way, and Silas will be in touch to lock in a time."}</p>
        <dl className="mt-4 rounded-lg bg-tint p-4">
          {state.lines && state.lines.length > 0 && <div className="mb-3 border-b border-line pb-3"><dt className="text-sm font-medium text-ink-soft">What you booked</dt><dd><ul className="mt-1 space-y-0.5">{state.lines.map((l) => <li key={l}>{l}</li>)}</ul></dd></div>}
          <div className="flex items-baseline justify-between gap-4"><dt className="font-semibold">Estimate<span className="block text-sm font-normal text-ink-soft">Tax included</span></dt><dd className="text-right font-display text-xl font-semibold tabular-nums">{state.estimate}</dd></div>
        </dl>
        {!!state.sent && <p className="mt-3 text-ink-soft">Got your {state.sent} photo{state.sent === 1 ? "" : "s"}, thanks.</p>}
        {!!state.unsent && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 font-medium text-amber-950">{state.unsent} photo{state.unsent === 1 ? "" : "s"} didn&apos;t send. Use the button below to try again.</p>}
        {(state.upload || hub) && (
          <div className="mt-5 space-y-2">
            {state.upload && <a href={state.upload} className={cta()}>{state.sent ? "Add more photos" : "Send us photos for a faster quote"}</a>}
            {hub && <a href={hub.back} className={cta(state.upload ? "secondary" : "primary")}>Back to your page</a>}
          </div>
        )}
      </section>
    );
  }

  const whoWhere = hub ? (
    <Step n={at.who} of={steps} title="Where?">
      <div className="space-y-2">
        {[...hub.properties, { id: "new", address: "A different address" }].map((p) => (
          <label key={p.id} className={choice}>
            <input type="radio" name="where" checked={where === p.id} onChange={() => setWhere(p.id)} className="size-5 shrink-0" /> <span className="min-w-0">{p.address}</span>
          </label>
        ))}
        {where === "new" && <div className="space-y-3 pt-2">
          <div><span className={labelCls}>Address</span><AddressField mapsKey={mapsKey} /></div>
          <label className="block"><span className={labelCls}>Access notes <span className="font-normal text-ink-soft">(optional)</span></span><input name="access" maxLength={300} placeholder="Side gate code, dog in the yard…" className={field} /></label>
        </div>}
      </div>
    </Step>
  ) : (
    <Step n={at.who} of={steps} title="Your details" hint="So we know where to come and how to reach you.">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={labelCls}>Name</span><input name="name" required maxLength={100} autoComplete="name" className={field} /></label>
        <label className="block"><span className={labelCls}>Email</span><input name="email" type="email" required autoComplete="email" inputMode="email" className={field} /></label>
        <div className="sm:col-span-2">
          <label className="block"><span className={labelCls}>Phone <span className="font-normal text-ink-soft">(optional)</span></span><input name="phone" type="tel" autoComplete="tel" className={field} /></label>
          <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-ink-soft"><input type="checkbox" name="smsOptIn" className="size-5 shrink-0" /> Text me when you&apos;re on the way &amp; done</label>
        </div>
        <div className="sm:col-span-2"><span className={labelCls}>Address</span><AddressField mapsKey={mapsKey} /></div>
        <label className="block sm:col-span-2"><span className={labelCls}>Access notes <span className="font-normal text-ink-soft">(optional)</span></span><input name="access" maxLength={300} placeholder="Side gate code, dog in the yard…" className={field} /></label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 pt-1 text-ink-soft sm:col-span-2"><input type="checkbox" name="offers" className="mt-0.5 size-5 shrink-0" /> <span>Email me seasonal offers from etc. (a few a year; unsubscribe any time)</span></label>
      </div>
    </Step>
  );

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Step id="book-what" n={at.what} of={steps} title="What do you need?" hint="Tick everything you&rsquo;d like done.">
        {needService && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 font-medium text-red-900">{state.msg}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.label} className={`${choice} items-start py-3`}>
              <input type="checkbox" checked={picked.includes(s.label)} className="mt-0.5 size-5 shrink-0"
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.label] : p.filter((x) => x !== s.label)))} />
              <span className="min-w-0 flex-1"><span className="font-semibold">{s.label}</span>{s.description && <span className="block text-sm text-ink-soft">{s.description}</span>}</span>
              <span className={`shrink-0 tabular-nums ${s.price ? "font-semibold" : "text-ink-soft"}`}>{s.price ?? "Quote"}</span>
            </label>
          ))}
        </div>
        {shovel && (
          <div className="mt-4 space-y-4 rounded-lg bg-tint p-4">
            <fieldset>
              <legend className="mb-2 font-display text-[1.05rem] font-semibold">Snow shovelling: how often?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {["One-time visit", "Every snowfall"].map((p) => (
                  <label key={p} className={choice}><input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} className="size-5 shrink-0" />
                    <span><span className="font-semibold">{p}</span>{p === "Every snowfall" && <span className="block text-sm text-ink-soft">$5 off every time</span>}</span></label>
                ))}
              </div>
            </fieldset>
            {!known && (
              <fieldset>
                <legend className="mb-2 font-semibold">How big is the driveway?</legend>
                <div className="space-y-2">
                  {SIZE_OPTIONS.map(([v, d]) => (
                    <label key={v} className={choice}><input type="radio" name="size" value={v} checked={size === v} onChange={() => setSize(v)} className="size-5 shrink-0" /> <span><span className="font-semibold">{v}</span> <span className="block text-sm text-ink-soft">{d}</span></span></label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend className="mb-2 font-semibold">Add-ons</legend>
              <div className="space-y-2">
                {!known && <label className={choice}><input type="checkbox" name="extraWalk" className="size-5 shrink-0" /> <span className="flex-1">Corner lot or extra sidewalk</span><span className="shrink-0 font-semibold tabular-nums">+$10</span></label>}
                <label className={choice}><input type="checkbox" name="icemelt" className="size-5 shrink-0" /> <span className="flex-1">Add ice melt</span><span className="shrink-0 font-semibold tabular-nums">+$5</span></label>
              </div>
            </fieldset>
            {!known && <p className="text-sm text-ink-soft">Prices are for the size you pick. We check every driveway on the map before the first visit; if it&apos;s bigger, we&apos;ll send you the right price to OK first.</p>}
          </div>
        )}
      </Step>
      {hasWhen && (
        <Step n={at.when} of={steps} title="When?">
          <div className="space-y-4">
            {showTimes && (
              <fieldset className="min-w-0">
                <legend className="font-semibold">When can we come take a look? <span className="font-normal text-ink-soft">(optional)</span></legend>
                <p className="mb-3 text-ink-soft">We&apos;ll come by, see the job and give you a price.</p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
                  {days.map((d) => <button key={d.date} type="button" aria-pressed={d.date === day.date} aria-label={dayName(d.date)} onClick={() => { setDayPick(d.date); setSlot(null); }}
                    className={`flex min-h-[68px] w-[4.5rem] flex-none flex-col items-center justify-center rounded-lg border leading-tight ${d.date === day.date ? "border-blue bg-blue/5" : "border-line bg-white hover:border-ink-faint/60"}`}>
                    <span className="text-sm text-ink-soft">{dayPart(d.date, { weekday: "short" })}</span>
                    <span className="font-display text-xl font-semibold tabular-nums">{dayPart(d.date, { day: "numeric" })}</span>
                    <span className="text-sm text-ink-soft">{dayPart(d.date, { month: "short" })}</span>
                  </button>)}
                </div>
                <p className="mb-2 mt-2 text-sm font-medium text-ink-soft">{dayPart(day.date, { weekday: "long", month: "long", day: "numeric" })}</p>
                <div className="flex flex-wrap gap-2">
                  {slots!.windows.filter((w) => day.windows.includes(w.key)).map((w) => (
                    <label key={w.key} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-4 font-semibold hover:border-ink-faint/60 has-[:checked]:border-blue has-[:checked]:bg-blue has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue">
                      <input type="radio" name="slotWindow" className="sr-only" checked={slot?.date === day.date && slot.window === w.key} onChange={() => setSlot({ date: day.date, window: w.key })} />
                      {w.label} <span className="font-normal opacity-75 tabular-nums">{w.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {showDate && <label className="block"><span className={labelCls}>Preferred date <span className="font-normal text-ink-soft">(optional)</span></span><input name="date" type="date" className={field} /></label>}
          </div>
        </Step>
      )}
      {whoWhere}
      <Step n={at.more} of={steps} title="Anything else?">
        <div className="space-y-4">
          {quoted && (
            <label className="block"><span className={labelCls}>Photos of the job <span className="font-normal text-ink-soft">(optional, up to 20)</span></span>
              <span className="mb-2 block text-ink-soft">The whole area, close-ups of the tricky bits, and how we get there. We can often quote from photos alone.</span>
              <input type="file" accept="image/*" multiple className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-tint file:px-3 file:py-1.5 file:font-semibold file:text-navy`} onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, 20))} />
              {photos.length > 0 && <span className="mt-1 block text-ink-soft">{photos.length} photo{photos.length === 1 ? "" : "s"} ready to send</span>}
            </label>
          )}
          <label className="block"><span className={labelCls}>Notes for the crew <span className="font-normal text-ink-soft">(optional)</span></span><textarea name="notes" rows={3} maxLength={2000} defaultValue={hub?.prefill?.note} className={field} /></label>
          <fieldset>
            <legend className="mb-2 font-semibold">Pay after the job by</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className={choice}><input type="radio" name="payment" value="e-Transfer" defaultChecked={hub?.payment !== "Cash"} className="size-5 shrink-0" /> e-Transfer</label>
              <label className={choice}><input type="radio" name="payment" value="Cash" defaultChecked={hub?.payment === "Cash"} className="size-5 shrink-0" /> Cash</label>
            </div>
          </fieldset>
        </div>
      </Step>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <section aria-label="Check and send" className="rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-lg font-semibold">Check and send</h2>
        {picked.length ? (
          <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
            {picked.map((label) => (
              <li key={label} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0">{label}{label === "Snow shovelling" && <span className="block text-sm text-ink-soft">{plan}{!known && ` · ${size.toLowerCase()} driveway`}</span>}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">{services.find((s) => s.label === label)?.price ?? "Quote"}</span>
              </li>
            ))}
            {showTimes && slot && <li className="py-2.5">We&apos;ll come take a look {dayName(slot.date)}<span className="block text-sm text-ink-soft">{slots!.windows.find((w) => w.key === slot.window)?.label} {slots!.windows.find((w) => w.key === slot.window)?.hint}</span></li>}
          </ul>
        ) : <p className={`mt-1 ${needService ? "font-medium text-red-800" : "text-ink-soft"}`}>Nothing picked yet: tick at least one service in step 1.</p>}
        <p className="mt-3 text-sm text-ink-soft">Nothing to pay now: you pay after the job.</p>
        {state.status === "error" && state.at !== "services" && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 font-medium text-red-900">{state.msg}</p>}
        <button disabled={state.status === "sending"} className={cta("primary", "mt-4")}>{state.status === "sending" ? state.msg ?? "Sending…" : hub ? "Send order" : "Send booking"}</button>
      </section>
    </form>
  );
}
