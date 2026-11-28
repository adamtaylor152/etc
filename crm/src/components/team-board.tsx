"use client";
// Team view: a lane per person (day) or a person × day grid (week). Drag a card to another lane/day to reassign or move it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, CheckCheck, TriangleAlert } from "lucide-react";
import { teamMove } from "@/app/(owner)/schedule-actions";

export type BoardCard = { key: string; kind: "visit" | "task" | "event"; id: string; title: string; sub: string; time: string; userIds: string[]; date: string; done: boolean; warnings: string[]; confirmed: boolean; href: string; movable: boolean };
export type Lane = { id: string | null; name: string; color: string; offByDate: Record<string, string | null> };

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--color-tint),var(--color-tint)_6px,#fff_6px,#fff_12px)]";

export function TeamBoard({ lanes, dates, cards, today }: { lanes: Lane[]; dates: string[]; cards: BoardCard[]; today?: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  async function drop(e: React.DragEvent, laneId: string | null, date: string) {
    e.preventDefault();
    setOver(null); setDragging(false);
    const [kind, id] = e.dataTransfer.getData("text/plain").split(":");
    if (!id) return;
    setMsg("Saving…");
    try { const w = await teamMove(kind as BoardCard["kind"], id, laneId, date); setMsg(w.length ? `Moved, but: ${w.join("; ")}` : "Moved"); router.refresh(); }
    catch { setMsg("Couldn't move that"); }
  }
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const week = dates.length > 1;
  const cap = week ? 4 : 8;
  const head = "border-b border-line bg-tint/60 px-3 py-2 text-xs font-medium text-ink-soft";
  const msgCls = msg.startsWith("Moved, but") ? "bg-amber-50 text-amber-950" : msg.startsWith("Couldn't") ? "bg-red-50 text-red-900" : "text-ink-soft";
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <div className="overflow-x-auto">
        <div className="grid" role="table" aria-label="Team schedule" style={{ gridTemplateColumns: week ? `9.5rem repeat(${dates.length}, minmax(9rem, 1fr))` : "minmax(6.5rem, 9.5rem) minmax(13rem, 1fr)" }}>
          <div role="row" className="contents">
            <div role="columnheader" className={`${head} sticky left-0 z-10 bg-tint`}>Person</div>
            {dates.map((d) => <div key={d} role="columnheader" className={`${head} border-l tabular-nums ${d === today ? "font-semibold text-blue-deep" : ""}`}>{day(d)}{d === today && <span className="sr-only"> (today)</span>}</div>)}
          </div>
          {lanes.map((l, li) => {
            const last = li === lanes.length - 1;
            // A cell shows its first few cards; the rest open in place under "+N more".
            const card = (c: BoardCard) => (
              <div key={c.key} draggable={c.movable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${c.kind}:${c.id}`); e.dataTransfer.effectAllowed = "move"; setDragging(true); }} onDragEnd={() => { setDragging(false); setOver(null); }}
                title={c.movable ? undefined : "This one stays where it is (done, or part of a storm)"}
                className={`relative rounded-md border-l-[3px] px-2 py-1.5 text-xs ${c.done ? "bg-tint/60 text-ink-soft" : "bg-tint"} ${c.movable ? "cursor-grab hover:bg-line-soft active:cursor-grabbing" : ""}`} style={{ borderLeftColor: l.color }}>
                <Link href={c.href} className="flex items-baseline gap-1.5 font-semibold hover:text-blue-deep">
                  {c.done ? <Check className="size-3 shrink-0 self-center text-emerald-700" strokeWidth={2.5} aria-label="Done" /> : c.confirmed && !c.warnings.length ? <CheckCheck className="size-3 shrink-0 self-center text-emerald-700" strokeWidth={2} aria-label="Client confirmed" /> : null}
                  {c.time && <span className="shrink-0 font-medium tabular-nums text-ink-soft">{c.time}</span>}
                  <span className="min-w-0 truncate">{c.title}</span>
                </Link>
                <span className="block truncate text-ink-soft">{c.sub}</span>
                {c.warnings.length > 0 && (
                  <ul className="mt-1 space-y-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-1 font-medium text-amber-950">
                    {c.warnings.map((w) => <li key={w} className="flex gap-1"><TriangleAlert className="mt-px size-3 shrink-0 text-amber-700" strokeWidth={2} aria-hidden />{w}</li>)}
                  </ul>
                )}
              </div>
            );
            const mine = cards.filter((c) => (l.id ? c.userIds.includes(l.id) : !c.userIds.length));
            return (
              <div key={l.id ?? "none"} role="row" className="contents">
                <div role="rowheader" className={`sticky left-0 z-10 bg-white px-3 py-2.5 text-sm ${last ? "" : "border-b border-line"}`}>
                  <span className="flex items-center gap-2 font-semibold"><span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden /><span className="truncate">{l.name}</span></span>
                  <span className="mt-0.5 block pl-[1.125rem] text-xs tabular-nums text-ink-soft">{mine.length} {mine.length === 1 ? "item" : "items"}</span>
                </div>
                {dates.map((d) => {
                  const off = l.offByDate[d];
                  const here = mine.filter((c) => c.date === d);
                  const cell = `${l.id}|${d}`;
                  const target = over === cell;
                  return (
                    <div key={d} role="cell" onDragOver={(e) => { e.preventDefault(); setOver(cell); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }} onDrop={(e) => drop(e, l.id, d)}
                      className={`relative min-h-20 space-y-1.5 border-l border-line p-1.5 ${last ? "" : "border-b"} ${target ? "bg-blue/8" : off ? HATCH : d === today && week ? "bg-blue/[.03]" : ""}`}>
                      {/* While a card is in the air every cell shows as a place to drop it; the one under the pointer fills in. */}
                      {dragging && <span aria-hidden className={`pointer-events-none absolute inset-1 rounded-lg border-2 border-dashed ${target ? "border-blue" : "border-blue/25"}`} />}
                      {off && <p className="inline-block rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{off.charAt(0).toUpperCase() + off.slice(1)}</p>}
                      {here.slice(0, cap).map(card)}
                      {here.length > cap && (
                        <details className="group">
                          <summary className="flex min-h-8 list-none items-center rounded-md px-2 text-xs font-semibold text-blue hover:bg-tint hover:text-blue-deep">
                            <span className="tabular-nums group-open:hidden">+{here.length - cap} more</span><span className="hidden group-open:inline">Show fewer</span>
                          </summary>
                          <div className="mt-1.5 space-y-1.5">{here.slice(cap).map(card)}</div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {msg && <p className={`border-t border-line px-3.5 py-2.5 text-sm font-medium ${msgCls}`} role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
