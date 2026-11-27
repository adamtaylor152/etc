"use client";
// Keeps an open thread fresh (new texts, delivery receipts) and pinned to the newest message.
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function LiveThread({ count, children }: { count: number; children: React.ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // ponytail: polls every 8s while the tab is visible; push (SSE) if it ever feels slow.
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 8000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [count]);
  return <div ref={box} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">{children}</div>;
}
