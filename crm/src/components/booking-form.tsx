"use client";
// The CRM's own booking form (app.etccrew.ca/book). Posts to the same /api/public/bookings as etccrew.ca's wizard,
// so validation, pricing and emails are identical. Services and prices come from the price book.
import { useState } from "react";

type Service = { label: string; price: string | null };

export function BookingForm({ services, phone }: { services: Service[]; phone: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [plan, setPlan] = useState("One-time visit");
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; msg?: string; upload?: string; estimate?: string; id?: number }>({ status: "idle" });
  const shovel = picked.includes("Snow shovelling");
  const input = "w-full min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-base";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!picked.length) return setState({ status: "error", msg: "Pick at least one service." });
    setState({ status: "sending" });
    const body = {
      name: f.get("name"), email: f.get("email"), phone: f.get("phone"), address: f.get("address"), access: f.get("access"),
      services: picked, plan: shovel ? plan : "", icemelt: shovel && f.get("icemelt") === "on",
      date: shovel && plan === "Every snowfall" ? "" : f.get("date"), notes: f.get("notes"), payment: f.get("payment"), website: f.get("website"),
    };
    const res = await fetch("/api/public/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setState({ status: "error", msg: `${data?.error ?? "Couldn't reach us."} You can also call ${phone}.` });
    setState({ status: "done", upload: data.uploadUrl, estimate: data.estimate, id: data.id });
  }

  if (state.status === "done") {
    return (
      <div className="rounded-3xl border border-line bg-white p-6 text-center">
        <div className="text-5xl">🙌</div>
        <h2 className="mt-2 font-display text-2xl font-bold">Thanks, neighbour! Booking #{state.id} is in.</h2>
        <p className="mt-2 text-ink-soft">Estimate: <b>{state.estimate}</b> (tax included). A confirmation is on its way, and Silas will be in touch to lock in a time.</p>
        {state.upload && <a href={state.upload} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-blue px-6 font-semibold text-white">Send us photos for a faster quote</a>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-line bg-white p-5 sm:p-6">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-display text-lg font-bold">About you</legend>
        <label className="text-sm font-semibold">Name<input name="name" required maxLength={100} autoComplete="name" className={input} /></label>
        <label className="text-sm font-semibold">Email<input name="email" type="email" required autoComplete="email" className={input} /></label>
        <label className="text-sm font-semibold">Phone (optional)<input name="phone" type="tel" autoComplete="tel" className={input} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Address<input name="address" required maxLength={300} autoComplete="street-address" placeholder="123 Evergreen Way SW, Calgary" className={input} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Access notes (optional)<input name="access" maxLength={300} placeholder="Side gate code, dog in the yard…" className={input} /></label>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-display text-lg font-bold">What do you need?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.label} className={`flex items-center justify-between gap-2 rounded-xl border p-3 ${picked.includes(s.label) ? "border-blue bg-blue/5" : "border-line"}`}>
              <span className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(s.label)} className="size-5"
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.label] : p.filter((x) => x !== s.label)))} /> {s.label}</span>
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
          <label className="flex items-center gap-2"><input type="checkbox" name="icemelt" className="size-5" /> Add ice melt (+$5)</label>
        </fieldset>
      )}
      {!(shovel && plan === "Every snowfall") && <label className="block text-sm font-semibold">Preferred date (optional)<input name="date" type="date" className={input} /></label>}
      <label className="block text-sm font-semibold">Anything else? (optional)<textarea name="notes" rows={3} maxLength={2000} className={input} /></label>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 font-semibold">Pay after the job by</legend>
        <label className="flex items-center gap-2"><input type="radio" name="payment" value="e-Transfer" defaultChecked className="size-5" /> e-Transfer</label>
        <label className="flex items-center gap-2"><input type="radio" name="payment" value="Cash" className="size-5" /> Cash</label>
      </fieldset>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.msg}</p>}
      <button disabled={state.status === "sending"} className="min-h-14 w-full rounded-full bg-blue text-base font-semibold text-white disabled:opacity-50">{state.status === "sending" ? "Sending…" : "Send booking"}</button>
    </form>
  );
}
