"use client";
// Team view: a lane per person (day) or a person × day grid (week). Drag a card to another lane/day to reassign or move it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { teamMove } from "@/app/(owner)/schedule-actions";

export type BoardCard = { key: string; kind: "visit" | "task" | "event"; id: string; title: string; sub: string; time: string; userIds: string[]; date: string; done: boolean; warnings: string[]; confirmed: boolean; href: string; movable: boolean };
export type Lane = { id: string | null; name: string; color: string; offByDate: Record<string, string | null> };

export function TeamBoard({ lanes, dates, cards }: { lanes: Lane[]; dates: string[]; cards: BoardCard[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState<string | null>(null);
  async function drop(e: React.DragEvent, laneId: string | null, date: string) {
    e.preventDefault();
    setOver(null);
    const [kind, id] = e.dataTransfer.getData("text/plain").split(":");
    if (!id) return;
    setMsg("Saving…");
    try { const w = await teamMove(kind as BoardCard["kind"], id, laneId, date); setMsg(w.length ? `Moved, but: ${w.join("; ")}` : "Moved"); router.refresh(); }
    catch { setMsg("Couldn't move that"); }
  }
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const week = dates.length > 1;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-card">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `10rem repeat(${dates.length}, minmax(${week ? "9rem" : "18rem"}, 1fr))` }}>
        <div className="border-b border-line p-2 text-xs font-bold uppercase text-ink-soft">Person</div>
        {dates.map((d) => <div key={d} className="border-b border-l border-line p-2 text-xs font-bold uppercase text-ink-soft">{day(d)}</div>)}
        {lanes.map((l) => (
          <div key={l.id ?? "none"} className="contents">
            <div className="flex items-start gap-2 border-b border-line p-2 text-sm font-semibold"><span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: l.color }} />{l.name}</div>
            {dates.map((d) => {
              const off = l.offByDate[d];
              const here = cards.filter((c) => c.date === d && (l.id ? c.userIds.includes(l.id) : !c.userIds.length));
              const cell = `${l.id}|${d}`;
              return (
                <div key={d} onDragOver={(e) => { e.preventDefault(); setOver(cell); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, l.id, d)}
                  className={`min-h-20 space-y-1.5 border-b border-l border-line p-1.5 ${off ? "bg-[repeating-linear-gradient(45deg,#f4f7fc,#f4f7fc_6px,#fff_6px,#fff_12px)]" : ""} ${over === cell ? "bg-blue/10" : ""}`}>
                  {off && <p className="text-[11px] font-semibold text-ink-soft">{off}</p>}
                  {here.map((c) => (
                    <div key={c.key} draggable={c.movable} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${c.kind}:${c.id}`)}
                      className={`rounded-md border-l-4 bg-tint px-2 py-1 text-xs ${c.movable ? "cursor-grab active:cursor-grabbing" : ""} ${c.done ? "opacity-50 line-through" : ""}`} style={{ borderLeftColor: l.color }}>
                      <Link href={c.href} className="block font-semibold">{c.warnings.length ? "⚠ " : c.confirmed ? "👍 " : ""}{c.time && <span className="text-ink-soft">{c.time} </span>}{c.title}</Link>
                      <span className="block truncate text-ink-soft">{c.sub}</span>
                      {c.warnings.map((w) => <span key={w} className="block text-amber-800">{w}</span>)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {msg && <p className="border-t border-line p-2 text-sm text-ink-soft" aria-live="polite">{msg}</p>}
    </div>
  );
}
