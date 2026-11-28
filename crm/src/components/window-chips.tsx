"use client";
// One tap fills the form's start/end time inputs with a schedule window.
import { windowHint, WINDOWS, type Win } from "@/server/windows";

export function WindowChips({ windows = WINDOWS, start = "startTime", end = "endTime" }: { windows?: Win[]; start?: string; end?: string }) {
  function pick(e: React.MouseEvent<HTMLButtonElement>, from: string, to: string) {
    const form = e.currentTarget.form;
    const set = (name: string, v: string) => { const el = form?.elements.namedItem(name); if (el instanceof HTMLInputElement) el.value = v; };
    set(start, from); set(end, to);
    const anyTime = form?.elements.namedItem("allDay");
    if (anyTime instanceof HTMLInputElement) anyTime.checked = false;
  }
  return (
    <div role="group" aria-label="Fill the times from an arrival window" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs font-medium text-ink-soft">Arrival window</span>
      {windows.map((w) => (
        <button key={w.key} type="button" onClick={(e) => pick(e, w.from, w.to)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-semibold hover:border-blue/40 hover:bg-blue/5 hover:text-blue-deep">
          {w.label}<span className="font-normal tabular-nums text-ink-soft">{windowHint(w)}</span>
        </button>
      ))}
    </div>
  );
}
