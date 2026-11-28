"use client";
// Schedule (FullCalendar v7, MIT plugins): month / week / day / list. Filters by type, person and status.
// Click an empty slot to create; click an item for a popover (open, assign, done); drag or resize to reschedule;
// drag from the Unscheduled drawer onto the calendar to book.
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import "./schedule/calendar.css";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarClock, Check, CheckCheck, ClipboardList, Clock, GripVertical, Hammer, Inbox, PanelRightClose, PanelRightOpen, RefreshCw, TriangleAlert, X } from "lucide-react";
import { assignPeople, calendarMove, taskDone } from "@/app/(owner)/schedule-actions";
import { moveStatus } from "./move-status";
import { clockTime } from "@/server/dates";
import type { CalItem, Person } from "@/server/schedule";
import { btn, Card } from "./ui";

type Kind = CalItem["kind"];
const KIND_LABEL: Record<Kind, string> = { visit: "Visits", task: "Tasks", event: "Events", assessment: "Assessments" };
type Pop = { x: number; y: number } & ({ type: "slot"; date: string; time?: string } | { type: "item"; item: CalItem });

const small = "min-h-9 px-3 text-[13px]";
const selCls = "min-h-9 max-sm:min-h-11 rounded-lg border border-line bg-white px-2.5 py-1 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-[13px]";
const menuRow = "flex min-h-10 items-center gap-2.5 rounded-lg px-2 font-medium hover:bg-tint";
const ico = { className: "size-4 shrink-0", strokeWidth: 1.75, "aria-hidden": true } as const;
/** The icon drawn before an event's title (calendar.css), in the order one state outranks another. */
/** How many rows a list view shows before "Show all": a storm day can hold hundreds of visits. */
const LIST_CAP = 30;
const ymd = (d: Date) => d.toLocaleDateString("en-CA");
/** The calendar day an item sits on, in the viewer's zone (the one FullCalendar draws in). */
const dayOf = (i: CalItem) => (i.allDay ? i.start.slice(0, 10) : ymd(new Date(i.start)));
const orderKey = (i: CalItem) => `${dayOf(i)}${i.allDay ? "0" : `1${i.start}`}`;
const stateOf = (i: CalItem) => (i.done ? "done" : i.warnings?.length ? "warn" : i.late ? "late" : i.rescheduleAsked ? "ask" : i.confirmed ? "ok" : "");

export function ScheduleCalendar({ items, unscheduled, team, initialDate }: { items: CalItem[]; unscheduled: CalItem[]; team: Person[]; initialDate: string }) {
  const router = useRouter();
  const drawer = useRef<HTMLDivElement>(null);
  const [kinds, setKinds] = useState<Kind[]>(["visit", "task", "event", "assessment"]);
  const [person, setPerson] = useState<string>("");
  const [status, setStatus] = useState<"" | "open" | "done" | "late">("");
  const [pop, setPop] = useState<Pop | null>(null);
  // null = not chosen yet: open beside the calendar on a wide screen, closed behind its button where it would stack below.
  const [drawerChoice, setShowDrawer] = useState<boolean | null>(null);
  // The view on screen (set by FullCalendar once it draws), and whether a long list has been opened up.
  const [view, setView] = useState<{ list: boolean; from: string; to: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState("");
  // The calendar draws in the browser only: times are formatted in the viewer's zone and the first view depends on the
  // screen width, so a server-rendered copy would not match. Until then a skeleton holds its place.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const phone = mounted && window.innerWidth < 640;
  const showDrawer = drawerChoice ?? (unscheduled.length > 0 && (!mounted || window.matchMedia("(min-width: 1024px)").matches));

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
  // A list view draws one row per item, so a storm day (hundreds of visits) made a page tens of thousands of pixels
  // long. It shows the first LIST_CAP rows of the period until "Show all" is pressed; the grid views are not capped.
  const range = view ?? (phone ? { list: true, from: initialDate, to: ymd(new Date(new Date(`${initialDate}T12:00`).getTime() + 864e5)) } : null);
  const inList = range?.list ? shown.filter((i) => { const d = dayOf(i); return d >= range.from && d < range.to; }) : [];
  const capped = inList.length > LIST_CAP && !showAll;
  const drawn = capped ? [...inList].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0)).slice(0, LIST_CAP) : shown;
  const listCount = inList.length.toLocaleString("en-CA");

  async function move(key: string, start: string, end: string | null, allDay: boolean, revert?: () => void) {
    const [kind, id] = key.split(":") as [Kind, string];
    if (kind === "assessment") { revert?.(); return; }
    setMsg("Saving…");
    try { setMsg(moveStatus(await calendarMove(kind, id, start, end, allDay))); router.refresh(); }
    catch { revert?.(); setMsg("Couldn't save that move"); }
  }
  const toggleKind = (k: Kind) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  const msgCls = msg.startsWith("Saved, but") ? "border-amber-200 bg-amber-50 text-amber-950" : msg.startsWith("Couldn't") ? "border-red-200 bg-red-50 text-red-900" : "border-line bg-tint text-ink-soft";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
            const on = kinds.includes(k);
            return (
              <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={on}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold max-sm:min-h-11 ${on ? "border-blue/30 bg-blue/8 text-blue-deep hover:bg-blue/12" : "border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:text-navy"}`}>
                {on && <Check className="size-3.5" strokeWidth={2.25} aria-hidden />}{KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" className={selCls}>
            <option value="">Everyone</option>{team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">Unassigned</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className={selCls}>
            <option value="">Any status</option><option value="open">Not done</option><option value="late">Overdue</option><option value="done">Completed</option>
          </select>
        </div>
        <button type="button" onClick={() => setShowDrawer(!showDrawer)} aria-expanded={showDrawer} aria-controls="unscheduled-drawer" className={btn("secondary", `${small} ml-auto`)}>
          {showDrawer ? <PanelRightClose {...ico} /> : <PanelRightOpen {...ico} />}Unscheduled
          <span className={`rounded-full px-1.5 text-xs tabular-nums ${unscheduled.length ? "bg-amber-100 text-amber-900" : "bg-tint text-ink-soft"}`}>{unscheduled.length}</span>
        </button>
      </div>

      <div className={`grid items-start gap-4 ${showDrawer ? "lg:grid-cols-[minmax(0,1fr)_17rem]" : ""}`}>
        <Card className="etc-cal min-w-0 p-3! sm:p-4!">
          {!mounted ? <div className="skeleton h-[32rem]" role="status" aria-label="Loading the calendar" /> : <FullCalendar
            plugins={[classicThemePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={phone ? "listDay" : "timeGridWeek"}
            datesSet={(d) => { setView({ list: d.view.type.startsWith("list"), from: ymd(d.start), to: ymd(d.end) }); setShowAll(false); }}
            initialDate={initialDate}
            headerToolbar={{ left: "today prev,next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
            firstDay={1} height="auto" slotMinTime="06:00:00" slotMaxTime="21:00:00" nowIndicator allDayText="Any time"
            // Times read as they do everywhere else in the app: "6:30 a.m.", and "6:30 – 7:30 a.m." for a block.
            eventTimeFormat={({ start, end }) => {
              const from = clockTime(start.hour, start.minute);
              if (!end) return from;
              const to = clockTime(end.hour, end.minute);
              return `${from.slice(-4) === to.slice(-4) ? from.slice(0, -5) : from} – ${to}`;
            }}
            slotHeaderFormat={({ date }) => clockTime(date.hour, date.minute).replace(":00", "")}
            editable droppable eventResizableFromStart={false}
            // A busy day stays readable: a few blocks, then "+N more" (which opens the full list for that day or slot).
            dayMaxEvents={4} eventMaxStack={3}
            // Our class hooks, styled in schedule/calendar.css.
            className="etc-fc" viewClass="etc-fc-view" toolbarClass="etc-fc-toolbar" toolbarSectionClass="etc-fc-section" toolbarTitleClass="etc-fc-title" buttonGroupClass="etc-fc-group"
            buttonClass={(b) => `etc-fc-btn${b.isSelected ? " is-on" : ""}${b.isIconOnly ? " is-icon" : ""}${b.isDisabled ? " is-off" : ""}`}
            dayHeaderInnerClass={(d) => `etc-fc-head${d.isToday ? " is-today" : ""}`} slotHeaderInnerClass="etc-fc-axis" allDayHeaderInnerClass="etc-fc-axis"
            dayCellTopInnerClass={(d) => `etc-fc-daynum${d.isToday ? " is-today" : ""}${d.isOther ? " is-other" : ""}`}
            blockEventClass="etc-fc-block" blockEventInnerClass="etc-fc-block-inner" blockEventTimeClass="etc-fc-ev-time" blockEventTitleClass="etc-fc-ev-title"
            listItemEventClass="etc-fc-item" listItemEventTimeClass="etc-fc-ev-time" listItemEventTitleClass="etc-fc-ev-title"
            columnMoreLinkClass="etc-fc-more" rowMoreLinkClass="etc-fc-more" popoverClass="etc-fc-popover"
            listDayHeaderClass="etc-fc-listday" listDayHeaderInnerClass="etc-fc-listday-inner"
            views={{ list: { listItemEventClass: "etc-fc-item etc-fc-list-item", noEventsClass: "etc-fc-empty" } }}
            events={drawn.map((i) => {
              const state = stateOf(i);
              return {
                id: `${i.kind}:${i.id}`, title: i.title, start: i.start, end: i.end, allDay: i.allDay,
                // The colour is the person's (or the object type's when nobody is assigned): it becomes the block's edge and tint.
                color: i.color, contrastColor: "#14213d",
                editable: i.editable, extendedProps: { item: i },
                className: [i.done && "etc-ev-done", i.late && !i.done && "etc-ev-late", state && `etc-ev-i-${state}`].filter(Boolean).join(" "),
              };
            })}
            dateClick={(info) => {
              const s = info.dateStr;
              setPop({ type: "slot", date: s.slice(0, 10), time: info.allDay ? undefined : s.slice(11, 16), x: info.jsEvent.clientX, y: info.jsEvent.clientY });
            }}
            eventClick={(info) => { info.jsEvent.preventDefault(); setPop({ type: "item", item: info.event.extendedProps.item as CalItem, x: info.jsEvent.clientX, y: info.jsEvent.clientY }); }}
            eventDrop={(info) => { void move(info.event.id, info.event.startStr, info.event.endStr || null, info.event.allDay, info.revert); }}
            eventResize={(info) => { void move(info.event.id, info.event.startStr, info.event.endStr || null, info.event.allDay, info.revert); }}
            eventReceive={(info) => { const id = info.event.id, s = info.event.startStr, e = info.event.endStr || null, a = info.event.allDay; info.event.remove(); void move(id, s, e, a); }}
          />}
          {inList.length > LIST_CAP && (
            <p className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm tabular-nums text-ink-soft">
              {capped ? `Showing the first ${LIST_CAP} of ${listCount}` : `Showing all ${listCount}`}
              <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className={btn("secondary", small)}>{capped ? `Show all ${listCount}` : `Show the first ${LIST_CAP}`}</button>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft pt-3 text-xs text-ink-soft">
            {team.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</span>)}
            <span className="inline-flex items-center gap-1"><Check className="size-3.5" strokeWidth={2} aria-hidden />Done</span>
            <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3.5 text-amber-700" strokeWidth={1.75} aria-hidden />Conflict</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5 text-red-700" strokeWidth={1.75} aria-hidden />Overdue</span>
            <span className="inline-flex items-center gap-1"><RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />Asked to reschedule</span>
            <span className="inline-flex items-center gap-1"><CheckCheck className="size-3.5" strokeWidth={1.75} aria-hidden />Client confirmed</span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">Moving a visit tells the client about the new time.</p>
          {msg && <p className={`mt-3 rounded-lg border px-3.5 py-2.5 text-sm font-medium ${msgCls}`} role="status" aria-live="polite">{msg}</p>}
        </Card>
        {showDrawer && (
          <Card className={`p-4! ${drawerChoice === null ? "max-lg:hidden" : ""}`} title="Unscheduled" actions={<span className="text-xs font-medium tabular-nums text-ink-soft">{unscheduled.length}</span>}>
            {/* A long backlog scrolls inside the panel instead of stretching the page. */}
            <div ref={drawer} id="unscheduled-drawer" className="-mr-2 max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-2 lg:max-h-[calc(100dvh-16rem)]">
              {unscheduled.length ? unscheduled.map((u) => (
                <div key={u.kind + u.id} data-item={u.id} data-kind={u.kind} data-title={u.title}
                  className="flex cursor-grab items-start gap-1.5 rounded-md border-l-[3px] bg-tint py-2 pl-2 pr-2.5 text-sm hover:bg-line-soft active:cursor-grabbing" style={{ borderLeftColor: u.color }}>
                  <GripVertical className="mt-0.5 size-4 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0"><Link href={u.href} className="font-semibold hover:text-blue-deep">{u.title}</Link><div className="text-xs text-ink-soft">{u.sub}</div></div>
                </div>
              )) : <p className="rounded-lg border border-dashed border-line bg-tint/40 px-4 py-6 text-center text-sm text-ink-soft">Everything is booked.</p>}
            </div>
            <p className="mt-3 text-xs text-ink-soft">Drag onto the calendar to book. Storm visits stay on their storm day.</p>
          </Card>
        )}
      </div>

      {pop && (
        <div className="fixed inset-0 z-40" onMouseDown={(e) => { if (e.target === e.currentTarget) setPop(null); }}>
          <div role="dialog" aria-label={pop.type === "slot" ? "Create" : pop.item.title}
            className="absolute max-h-[calc(100dvh-1.5rem)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line bg-white p-3.5 text-sm shadow-lift"
            style={{ left: Math.max(12, Math.min(pop.x, window.innerWidth - 300)), top: Math.max(12, Math.min(pop.y, window.innerHeight - (pop.type === "slot" ? 250 : 400))) }}>
            <button type="button" onClick={() => setPop(null)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-ink-soft hover:bg-tint hover:text-navy" aria-label="Close"><X className="size-4" strokeWidth={1.75} aria-hidden /></button>
            {pop.type === "slot" ? (
              <>
                <p className="mb-2 pr-8 font-display text-[0.95rem] font-semibold tabular-nums">{new Date(`${pop.date}T12:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}{pop.time && ` · ${timeOf(`${pop.date}T${pop.time}`)}`}</p>
                <div className="-mx-1 grid">
                  <Link href={`/jobs/new?date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className={menuRow}><Hammer {...ico} className="size-4 shrink-0 text-ink-soft" />New job visit</Link>
                  <Link href={`/tasks/new?date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className={menuRow}><ClipboardList {...ico} className="size-4 shrink-0 text-ink-soft" />New task</Link>
                  <Link href={`/tasks/new?kind=EVENT&date=${pop.date}${pop.time ? `&time=${pop.time}` : ""}`} className={menuRow}><CalendarClock {...ico} className="size-4 shrink-0 text-ink-soft" />New event</Link>
                  <Link href={`/requests?new=1&date=${pop.date}`} className={menuRow}><Inbox {...ico} className="size-4 shrink-0 text-ink-soft" />Requests</Link>
                </div>
              </>
            ) : (
              <>
                <p className="pr-8 font-display text-[0.95rem] font-semibold leading-snug">{pop.item.title}</p>
                <p className="mt-0.5 text-xs tabular-nums text-ink-soft">{pop.item.sub}{!pop.item.allDay && pop.item.start && ` · ${timeOf(pop.item.start)}${pop.item.end ? `–${timeOf(pop.item.end)}` : ""}`}</p>
                {(pop.item.done || pop.item.late || pop.item.confirmed || pop.item.rescheduleAsked) && (
                  <ul className="mt-2 space-y-1 text-xs font-medium">
                    {pop.item.done && <li className="flex items-center gap-1.5 text-emerald-800"><Check {...ico} className="size-3.5 shrink-0" />Done</li>}
                    {pop.item.late && <li className="flex items-center gap-1.5 text-red-700"><Clock {...ico} className="size-3.5 shrink-0" />Overdue</li>}
                    {pop.item.confirmed && <li className="flex items-center gap-1.5 text-emerald-800"><CheckCheck {...ico} className="size-3.5 shrink-0" />Client confirmed</li>}
                    {pop.item.rescheduleAsked && <li className="flex items-center gap-1.5 text-amber-800"><RefreshCw {...ico} className="size-3.5 shrink-0" />Client asked to reschedule</li>}
                  </ul>
                )}
                {pop.item.warnings?.length ? (
                  <ul className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-950">
                    {pop.item.warnings.map((w) => <li key={w} className="flex gap-1.5"><TriangleAlert {...ico} className="mt-px size-3.5 shrink-0 text-amber-700" />{w}</li>)}
                  </ul>
                ) : null}
                {pop.item.kind !== "assessment" && (
                  <form action={async (f) => { await assignPeople(f); setPop(null); router.refresh(); }} className="mt-3 border-t border-line-soft pt-3">
                    <input type="hidden" name="kind" value={pop.item.kind} /><input type="hidden" name="id" value={pop.item.id} />
                    <fieldset>
                      <legend className="mb-1 text-xs font-medium text-ink-soft">Assigned to</legend>
                      <div className="flex flex-wrap gap-x-4">
                        {team.map((p) => (
                          <label key={p.id} className="flex min-h-9 items-center gap-1.5"><input type="checkbox" name="userId" value={p.id} defaultChecked={pop.item.people.some((x) => x.id === p.id)} className="size-4" />
                            <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</label>
                        ))}
                      </div>
                    </fieldset>
                    <button className={btn("secondary", `${small} mt-1.5`)}>Save assignment</button>
                  </form>
                )}
                <div className="mt-3 flex gap-2 border-t border-line-soft pt-3">
                  <Link href={pop.item.href} className={btn("primary", small)}>Open</Link>
                  {(pop.item.kind === "task" || pop.item.kind === "event") && (
                    <form action={async (f) => { await taskDone(f); setPop(null); router.refresh(); }}>
                      <input type="hidden" name="id" value={pop.item.id} /><input type="hidden" name="done" value={pop.item.done ? "0" : "1"} />
                      <button className={btn("secondary", small)}><Check {...ico} />{pop.item.done ? "Mark not done" : "Mark done"}</button>
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
