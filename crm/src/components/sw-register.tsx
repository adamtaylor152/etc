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

/**
 * On the sign-in page: forget the routes this device saved for offline use (client names, addresses, gate codes), so
 * the next person to pick up a shared phone can't read them. Actions still waiting to send are kept.
 */
export function ForgetRoutes() {
  useEffect(() => {
    for (const k of Object.keys(localStorage)) if (/^etc-run-\d/.test(k)) localStorage.removeItem(k);
  }, []);
  return null;
}
