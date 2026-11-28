"use client";
// Address with Google Places autocomplete (same key as the booking page). Fills hidden lat/lng/placeId/postalCode so the
// server can find the community. Without a key, or if Google refuses, it's a plain text box plus a manual community pick.
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { inputCls } from "./ui";

// The public booking form (no community pick) is phone-first: 16px type at every width, as its other fields have.
const PUBLIC = "min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20";

type Place = { formatted_address?: string; place_id?: string; geometry?: { location: { lat: () => number; lng: () => number } }; address_components?: { long_name: string; types: string[] }[] };
type G = { maps: { places: { Autocomplete: new (el: HTMLInputElement, o: object) => { addListener: (e: string, f: () => void) => void; getPlace: () => Place } } } };
declare global { interface Window { google?: G; __etcPlaces?: Promise<void> } }

function loadPlaces(key: string) {
  window.__etcPlaces ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=__etcPlacesReady`;
    (window as unknown as Record<string, () => void>).__etcPlacesReady = () => res();
    s.onerror = () => rej(new Error("maps"));
    document.head.appendChild(s);
  });
  return window.__etcPlaces;
}

export function AddressField({ mapsKey, communities, defaults = {}, prefix = "", required = true }: {
  mapsKey?: string; communities?: { code: string; name: string }[]; prefix?: string; required?: boolean; // no communities (public booking): no manual pick
  defaults?: { formatted?: string; communityCode?: string | null; lat?: number | null; lng?: number | null };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; placeId: string; postalCode: string } | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!mapsKey || !input.current) return;
    let cancelled = false;
    loadPlaces(mapsKey).then(() => {
      if (cancelled || !input.current || !window.google) return;
      const ac = new window.google.maps.places.Autocomplete(input.current, {
        componentRestrictions: { country: "ca" }, fields: ["formatted_address", "geometry", "place_id", "address_components"], types: ["address"],
      });
      ac.addListener("place_changed", () => {
        const p = ac.getPlace();
        if (!p.geometry) return;
        if (p.formatted_address && input.current) input.current.value = p.formatted_address;
        const pc = p.address_components?.find((c) => c.types.includes("postal_code"));
        setGeo({ lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), placeId: p.place_id ?? "", postalCode: pc?.long_name ?? "" });
      });
      setReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapsKey]);
  const n = (k: string) => `${prefix}${k}`;
  return (
    <div className="space-y-2">
      <input ref={input} name={n("formatted")} defaultValue={defaults.formatted ?? ""} required={required} autoComplete="off"
        placeholder={ready ? "Start typing an address…" : "Street address, Calgary"} onChange={() => setGeo(null)}
        aria-label="Address" className={communities ? inputCls : PUBLIC} />
      {geo && <>
        <input type="hidden" name={n("lat")} value={geo.lat} /><input type="hidden" name={n("lng")} value={geo.lng} />
        <input type="hidden" name={n("placeId")} value={geo.placeId} /><input type="hidden" name={n("postalCode")} value={geo.postalCode} />
      </>}
      {communities && <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-normal text-ink-soft">
        Community
        <select name={n("communityCode")} defaultValue={defaults.communityCode ?? ""} className="min-h-9 min-w-0 max-w-full rounded-lg border border-line bg-white px-2 text-base text-navy hover:border-ink-faint/60 sm:text-[13px]">
          <option value="">{geo || defaults.lat != null ? "From the map pin" : "Not set (pick one)"}</option>
          {communities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        {geo && <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check className="size-3.5" aria-hidden />Pinned on the map</span>}
      </label>}
    </div>
  );
}
