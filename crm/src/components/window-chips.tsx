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
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-ink-soft">Window:</span>
      {windows.map((w) => (
        <button key={w.key} type="button" onClick={(e) => pick(e, w.from, w.to)} className="rounded-full border border-line bg-white px-2.5 py-1 font-semibold hover:border-blue">
          {w.label} <span className="font-normal text-ink-soft">{windowHint(w)}</span>
        </button>
      ))}
    </div>
  );
}
