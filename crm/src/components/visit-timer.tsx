"use client";
// Start/stop timer for a visit, ticking while it runs.
import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { timerStart, timerStop } from "@/app/(owner)/costing-actions";
import { btn } from "./ui";

export function VisitTimer({ visitId, runningSince, back }: { visitId: string; runningSince: string | null; back: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!runningSince) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [runningSince]);
  const secs = runningSince ? Math.max(0, Math.floor((now - Date.parse(runningSince)) / 1000)) : 0;
  const clock = `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  return runningSince ? (
    <form action={timerStop} className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="back" value={back} />
      <span className="font-display text-[1.7rem] font-semibold leading-none tabular-nums" aria-live="off">{clock}</span>
      <button className={btn("secondary", "min-h-11!")}><Square className="size-4" aria-hidden />Stop timer</button>
    </form>
  ) : (
    <form action={timerStart}>
      <input type="hidden" name="visitId" value={visitId} /><input type="hidden" name="back" value={back} />
      <button className={btn("secondary", "min-h-11!")}><Play className="size-4" aria-hidden />Start timer</button>
    </form>
  );
}
