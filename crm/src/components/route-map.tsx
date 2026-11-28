"use client";
import dynamic from "next/dynamic";
export type { MapArea, MapLine, MapStop } from "./route-map-inner";

export const RouteMap = dynamic(() => import("./route-map-inner"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-2xl bg-white sm:h-[28rem]" />,
});
