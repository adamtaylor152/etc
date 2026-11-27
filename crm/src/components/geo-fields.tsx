"use client";
// Adds the phone's location to a form as hidden lat/lng (proof of service). Never blocks the form:
// if location is denied or slow, the visit still completes without it.
import { useEffect, useState } from "react";

export function GeoFields() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);
  if (!pos) return null;
  return <><input type="hidden" name="lat" value={pos.lat} /><input type="hidden" name="lng" value={pos.lng} /></>;
}
