"use client";
// Schedule (FullCalendar v7, MIT plugins): month / week / day / list. Filters by type, person and status.
// Click an empty slot to create; click an item for a popover (open, assign, done); drag or resize to reschedule;
// drag from the Unscheduled drawer onto the calendar to book.
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, ClipboardList, Hammer, Inbox, PanelRightOpen, X } from "lucide-react";
import { assignPeople, calendarMove, taskDone } from "@/app/(owner)/schedule-actions";
import type { CalItem, Person } from "@/server/schedule";

type Kind = CalItem["kind"];
const KIND_LABEL: Record<Kind, string> = { visit: "Visits", task: "Tasks", event: "Events", assessment: "Assessments" };
type Pop = { x: number; y: number } & ({ type: "slot"; date: string; time?: string } | { type: "item"; item: CalItem });

export function ScheduleCalendar({ items, unscheduled, team, initialDate }: { items: CalItem[]; unscheduled: CalItem[]; team: Person[]; initialDate: string }) {
  const router = useRouter();
  const drawer = useRef<HTMLDivElement>(null);
  const [kinds, setKinds] = useState<Kind[]>(["visit", "task", "event", "assessment"]);
  const [person, setPerson] = useState<string>("");
  const [status, setStatus] = useState<"" | "open" | "done" | "late">("");
  const [pop, setPop] = useState<Pop | null>(null);
  const [showDrawer, setShowDrawer] = useState(unscheduled.length > 0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!drawer.current) return;
    const d = new Draggable(drawer.current, {
      itemSelector: "[data-item]",
      eventData: (el: HTMLElement) => ({ id: `${el.dataset.kind}:${el.dataset.item}`, title: el.dataset.title, allDay: true, create: true }),
    });
    return () => d.destroy();
  }, [showDrawer]);

  const shown = items.filter((i) => kinds.includes(i.kind)
    && (!person || (person === "none" ? !i.people.length : i.people.some((p) => p.id === person)))
    && (!status || (status === "done" ? i.done : status === "late" ? i.late : !i.done)));

  async function move(key: string, start: string, end: string | null, allDay: boolean, revert?: () => void) {
    const [kind, id] = key.split(":") as [Kind, string];
    if (kind === "assessment") { revert?.(); return; }
    setMsg("Saving…");
    try { await calendarMove(kind, id, start, end, allDay); setMsg("Saved"); router.refresh(); }
    catch { revert?.(); setMsg("Couldn't save that move"); }
  }
  const toggleKind = (k: Kind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2 shadow-card">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={kinds.includes(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${kinds.includes(k) ? "bg-navy text-white" : "bg-tint text-ink-soft"}`}>{KIND_LABEL[k]}</button>
        ))}
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" className="h-8 rounded-lg border border-line bg-white px-2 text-xs">
          <option value="">Everyone</option>{team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Unassigned</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className="h-8 rounded-lg border border-line bg-white px-2 text-xs">
          <option value="">Any status</option><option value="open">Not done</option><option value="late">Overdue</option><option value="done">Completed</option>
        </select>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          {team.map((p) => <span key={p.id} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span>)}
          <button type="button" onClick={() => setShowDrawer(!showDrawer)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 font-semibold text-navy">
            <PanelRightOpen className="size-3.5" />Unscheduled {unscheduled.length}
          </button>
        </span>
      </div>

      <div className={`grid gap-3 ${showDrawer ? "lg:grid-cols-[1fr_16rem]" : ""}`}>
        <div className="rounded-lg border border-line bg-white p-2 shadow-card sm:p-3">
          <FullCalendar
            plugins={[classicThemePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={typeof window !== "undefined" && window.innerWidth < 640 ? "listWeek" : "timeGridWeek"}
            initialDate={initialDate}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
            firstDay={1} height="auto" slotMinTime="06:00:00" slotMaxTime="21:00:00" nowIndicator allDayText="Any time"
            editable droppable eventResizableFromStart={false}
            events={shown.map((i) => ({
              id: `${i.kind}:${i.id}`, title: `${i.done ? "✓ " : ""}${i.title}`, start: i.start, end: i.end, allDay: i.allDay,
              // FullCalendar v7 takes color + contrastColor (no separate background/border/text colours).
              color: i.done ? "#cbd5e1" : i.late ? "#dc2626" : i.color, contrastColor: i.done ? "#334155" : "#ffffff",
              editable: i.editable, extendedProps: { item: i }, className: i.done ? "line-through" : "",
            }))}
            dateClick={(info) => {
              const s = info.dateStr;
              setPop({ type: "slot", date: s.slice(0, 10), time: info.allDay ? undefined : s.slice(11, 16), x: info.jsEvent.clientX, y: info.jsEvent.clientY });
            }}
            eventClick={(info) => { info.jsEvent.preventDefault(); setPop({ type: "item", item: info.event.extendedProps.item as CalItem, x: info.jsEvent.clientX, y: info.jsEvent.clientY }); }}
            eventDrop={(info) => { void move(info.event.id, info.event.startStr, info.event.endStr || null, info.event.allDay, info.revert); }}
            eventResize={(info) => { void move(info.event.id, info.event.startStr, info.event.endStr || null, info.event.allDay, info.revert); }}
            eventReceive={(info) => { const id = info.event.id, s = info.event.startStr, e = info.event.endStr || null, a = info.event.allDay; info.event.remove(); void move(id, s, e, a); }}
          />
          {msg && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{msg}</p>}
        </div>
        {showDrawer && (
          <aside className="rounded-lg border border-line bg-white p-3 shadow-card">
            <h2 className="mb-2 text-sm font-bold">Unscheduled</h2>
            <div ref={drawer} className="space-y-2">
              {unscheduled.length ? unscheduled.map((u) => (
                <div key={u.kind + u.id} data-item={u.id} data-kind={u.kind} data-title={u.title} className="cursor-grab rounded-lg border border-line border-l-4 bg-white p-2.5 text-sm active:cursor-grabbing" style={{ borderLeftColor: u.color }}>
                  <Link href={u.href} className="font-semibold">{u.title}</Link><div className="text-xs text-ink-soft">{u.sub}</div>
                </div>
              )) : <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-ink-soft">Everything&apos;s booked.</p>}
            </div>
            <p className="mt-2 text-xs text-ink-soft">Drag onto the calendar to book. Storm visits stay on their storm day.</p>
          </aside>
        )}
      </div>

      {pop && (
        <div className="fixed inset-0 z-40" onMouseDown={(e) => { if (e.target === e.currentTarget) setPop(null); }}>
          <div role="dialog" aria-label={pop.type === "slot" ? "Create" : pop.item.title}
            className="absolute w-72 rounded-lg border border-line bg-white p-3 text-sm shadow-xl"
            style={{ left: Math.min(pop.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300), top: Math.min(pop.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 260) }}>
            <button type="button" onClick={() => setPop(null)} className="absolute right-2 top-2 rounded p-1 text-ink-soft hover:bg-tint" aria-label="Close"><X className="size-4" /></button>
            {pop.type === "slot" ? (
              <>
                <p className="mb-2 pr-6 font-bold">{new Date(`${pop.date}T12:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}{pop.time && ` · ${timeOf(`${pop.date}T${pop.time}`)}`}</p>
                <div className="grid gap-1">
                  <Link href={`/jobs/new?date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className="flex items-center gap-2 rounded-md px-2 py-2 font-semibold hover:bg-tint"><Hammer className="size-4 text-emerald-700" />New job visit</Link>
                  <Link href={`/tasks/new?date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className="flex items-center gap-2 rounded-md px-2 py-2 font-semibold hover:bg-tint"><ClipboardList className="size-4 text-navy" />New task</Link>
                  <Link href={`/tasks/new?kind=EVENT&date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className="flex items-center gap-2 rounded-md px-2 py-2 font-semibold hover:bg-tint"><CalendarClock className="size-4 text-yellow-700" />New event</Link>
                  <Link href={`/requests?new=1&date=${pop.date}`} className="flex items-center gap-2 rounded-md px-2 py-2 font-semibold hover:bg-tint"><Inbox className="size-4 text-orange-700" />Requests</Link>
                </div>
              </>
            ) : (
              <>
                <p className="pr-6 font-bold">{pop.item.title}</p>
                <p className="text-xs text-ink-soft">{pop.item.sub}{!pop.item.allDay && pop.item.start && ` · ${timeOf(pop.item.start)}${pop.item.end ? `–${timeOf(pop.item.end)}` : ""}`}{pop.item.late && " · overdue"}{pop.item.done && " · done"}</p>
                {pop.item.kind !== "assessment" && (
                  <form action={async (f) => { await assignPeople(f); setPop(null); router.refresh(); }} className="mt-3">
                    <input type="hidden" name="kind" value={pop.item.kind} /><input type="hidden" name="id" value={pop.item.id} />
                    <p className="mb-1 text-xs font-semibold uppercase text-ink-soft">Assigned</p>
                    <div className="flex flex-wrap gap-2">
                      {team.map((p) => (
                        <label key={p.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="userId" value={p.id} defaultChecked={pop.item.people.some((x) => x.id === p.id)} className="size-3.5" />
                          <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}</label>
                      ))}
                    </div>
                    <button className="mt-2 rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-tint">Save assignment</button>
                  </form>
                )}
                <div className="mt-3 flex gap-2">
                  <Link href={pop.item.href} className="inline-flex min-h-9 items-center rounded-lg bg-blue px-3 text-xs font-semibold text-white">Open</Link>
                  {(pop.item.kind === "task" || pop.item.kind === "event") && (
                    <form action={async (f) => { await taskDone(f); setPop(null); router.refresh(); }}>
                      <input type="hidden" name="id" value={pop.item.id} /><input type="hidden" name="done" value={pop.item.done ? "0" : "1"} />
                      <button className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold hover:bg-tint"><Check className="size-3.5" />{pop.item.done ? "Not done" : "Mark done"}</button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
