"use client";
// Elapsed time since a start, ticking once a second, in tabular figures (the crew's day clock).
import { useEffect, useState } from "react";

export function RunningClock({ since, className = "" }: { since: string; className?: string }) {
  // Starts from the server's "now" so the first paint matches, then follows the phone's clock.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0), t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const secs = now == null ? null : Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const text = secs == null ? "–:––:––" : `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return <span className={`tabular-nums ${className}`} aria-hidden={secs == null}>{text}</span>;
}
