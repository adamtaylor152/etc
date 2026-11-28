"use client";
import { useEffect } from "react";

/**
 * Registers the offline service worker (production only, so dev reloads stay simple). The build id in the URL makes
 * every deploy a new worker, which saves the new build's files and drops the old build's.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? ""}`).catch(() => {});
  }, []);
  return null;
}
