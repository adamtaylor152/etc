"use client";
import dynamic from "next/dynamic";
export type { MapArea, MapLine, MapStop } from "./route-map-inner";

export const RouteMap = dynamic(() => import("./route-map-inner"), {
  ssr: false,
  loading: () => <div className="skeleton h-72 w-full rounded-xl border border-line sm:h-96 lg:h-[26rem]" role="status" aria-label="Loading the map" />,
});
