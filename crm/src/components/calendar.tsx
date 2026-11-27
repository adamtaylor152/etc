"use client";
// Schedule calendar (FullCalendar v7): month / week / list. Drag a visit to another day to reschedule;
// drag an unscheduled visit from the sidebar onto a day to book it.
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { calendarReschedule } from "@/app/(owner)/work-actions";

export type CalEvent = { id: string; title: string; date: string; color: string; done: boolean; editable: boolean };
export type Unscheduled = { id: string; title: string; sub: string };

const dayStr = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

export function ScheduleCalendar({ events, unscheduled, initialDate }: { events: CalEvent[]; unscheduled: Unscheduled[]; initialDate: string }) {
  const router = useRouter();
  const sidebar = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sidebar.current) return;
    const d = new Draggable(sidebar.current, {
      itemSelector: "[data-visit]",
      eventData: (el: HTMLElement) => ({ id: el.dataset.visit, title: el.dataset.title, allDay: true, create: true }),
    });
    return () => d.destroy();
  }, []);

  async function move(id: string, date: string, revert?: () => void) {
    setMsg("Saving…");
    try {
      await calendarReschedule(id, date);
      setMsg("Saved");
      router.refresh();
    } catch {
      revert?.();
      setMsg("Couldn't save that move");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <div className="rounded-2xl border border-line bg-white p-2 sm:p-3">
        <FullCalendar
          plugins={[classicThemePlugin, dayGridPlugin, listPlugin, interactionPlugin]}
          initialView={typeof window !== "undefined" && window.innerWidth < 640 ? "listWeek" : "dayGridMonth"}
          initialDate={initialDate}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,dayGridWeek,listWeek" }}
          firstDay={1}
          height="auto"
          editable
          droppable
          events={events.map((e) => ({ id: e.id, title: e.title, start: e.date, allDay: true, backgroundColor: e.color, borderColor: e.color, editable: e.editable, url: `/visits/${e.id}`, classNames: e.done ? ["opacity-60"] : [] }))}
          eventDrop={(info) => { void move(info.event.id, dayStr(info.event.startStr ?? info.event.start), info.revert); }}
          eventReceive={(info) => { const id = info.event.id; const date = dayStr(info.event.startStr ?? info.event.start); info.event.remove(); void move(id, date); }}
        />
        {msg && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{msg}</p>}
      </div>
      <div>
        <h2 className="mb-2 font-display text-lg font-bold">Not scheduled</h2>
        <div ref={sidebar} className="space-y-2">
          {unscheduled.length ? unscheduled.map((u) => (
            <div key={u.id} data-visit={u.id} data-title={u.title} className="cursor-grab rounded-xl border border-line bg-white p-3 text-sm active:cursor-grabbing">
              <a href={`/visits/${u.id}`} className="font-semibold">{u.title}</a><div className="text-ink-soft">{u.sub}</div>
            </div>
          )) : <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-soft">Everything&apos;s booked.</p>}
        </div>
        <p className="mt-2 text-xs text-ink-soft">Drag onto a day to book. Snow-storm visits stay on their storm day.</p>
      </div>
    </div>
  );
}
