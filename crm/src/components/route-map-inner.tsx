"use client";
// Leaflet map: community outlines + numbered stops. Loaded client-only (Leaflet needs window).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { GeoJsonObject } from "geojson";

export type MapStop = { id: string; n: number; lat: number; lng: number; label: string; done: boolean };
export type MapArea = { code: string; name: string; geometry: GeoJsonObject };

const icon = (n: number, done: boolean) => L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:${done ? "#10b981" : "#14213d"};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 13px system-ui">${n}</div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});

export default function RouteMapInner({ stops, areas, depot }: { stops: MapStop[]; areas: MapArea[]; depot: { lat: number; lng: number } }) {
  const pts: [number, number][] = [[depot.lat, depot.lng], ...stops.map((s) => [s.lat, s.lng] as [number, number])];
  const bounds = L.latLngBounds(pts).pad(0.15);
  return (
    <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-80 w-full rounded-2xl sm:h-[28rem]" style={{ zIndex: 0 }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19} />
      {areas.map((a) => (
        <GeoJSON key={a.code} data={a.geometry} style={{ color: "#1d6fd8", weight: 2, fillOpacity: 0.06 }} />
      ))}
      {stops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={icon(s.n, s.done)}>
          <Popup><a href={`/visits/${s.id}`} style={{ fontWeight: 600 }}>{s.n}. {s.label}</a></Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
