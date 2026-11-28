"use client";
// Conversation list: search, All/Unread/Unknown filters, the open thread highlighted.
// On phones it's its own screen (/messages); on wider screens it sits left of the open thread.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Search, SquarePen } from "lucide-react";
import { btn } from "@/components/ui";

export type Convo = { key: string; name: string; number: string | null; known: boolean; preview: string; mine: boolean; at: string; unread: number; failed: boolean };

const initials = (name: string) => (name.match(/[A-Za-z]/) ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "#");
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const opts: Intl.DateTimeFormatOptions = d.toDateString() === now.toDateString() ? { hour: "numeric", minute: "2-digit" }
    : now.getTime() - d.getTime() < 6 * 86_400_000 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return d.toLocaleString("en-CA", { ...opts, timeZone: "America/Edmonton" });
};

export function Inbox({ convos }: { convos: Convo[] }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "unknown">("all");
  const atList = path === "/messages";
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = convos.filter((c) =>
    (filter === "all" || (filter === "unread" ? c.unread > 0 : !c.known)) &&
    (!needle || c.name.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle) || (digits.length >= 3 && (c.number ?? "").includes(digits))));
  const unreadCount = convos.filter((c) => c.unread).length;
  const tab = (f: typeof filter, label: string) => (
    <button type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
      className={`min-h-9 whitespace-nowrap rounded-full border px-3 text-sm font-medium max-sm:min-h-11 max-sm:px-3.5 ${filter === f ? "border-blue/25 bg-blue/8 font-semibold text-blue-deep" : "border-line bg-white text-ink-soft hover:bg-tint hover:text-navy"}`}>{label}</button>
  );
  const Heading = atList ? "h1" : "h2";
  return (
    <aside className={`${atList ? "flex" : "hidden md:flex"} min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-card`} aria-label="Conversations">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <Heading className="font-display text-lg font-semibold">Messages</Heading>
          <Link href="/messages/new" className={btn("primary", "min-h-11 sm:min-h-10")}><SquarePen className="size-4" aria-hidden />New</Link>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, numbers, texts" aria-label="Search conversations"
            className="min-h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-base outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:min-h-10 sm:text-sm" />
        </label>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3" role="group" aria-label="Show">{tab("all", "All")}{tab("unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`)}{tab("unknown", "Unknown numbers")}</div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
        {shown.map((c) => {
          const active = path === `/messages/${c.key}`;
          const unread = active ? 0 : c.unread; // opening a thread marks it read
          return (
            <li key={c.key}>
              <Link href={`/messages/${c.key}`} aria-current={active ? "page" : undefined}
                className={`flex min-h-16 items-center gap-3 px-3 py-2.5 ${active ? "bg-blue/8 shadow-[inset_3px_0_0_var(--color-blue)]" : "hover:bg-tint active:bg-tint"}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${c.known ? "bg-blue/10 text-blue-deep" : "bg-tint text-ink-soft"}`} aria-hidden>{initials(c.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {unread > 0 && <span className="size-2 shrink-0 rounded-full bg-blue" aria-hidden />}
                      <span className={`truncate ${unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    </span>
                    <time dateTime={c.at} className={`shrink-0 text-xs tabular-nums ${unread ? "font-semibold text-blue-deep" : "text-ink-soft"}`}>{when(c.at)}</time>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? "font-medium text-navy" : "text-ink-soft"}`}>{c.failed && <span className="font-medium text-red-700">Not sent · </span>}{c.mine ? "You: " : ""}{c.preview}</span>
                    {unread > 0 && <span className="shrink-0 rounded-full bg-blue px-1.5 text-xs font-semibold leading-5 tabular-nums text-white">{unread}<span className="sr-only"> unread</span></span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {!shown.length && (
          <li className="px-6 py-10 text-center text-sm text-ink-soft">
            {convos.length ? "No conversations match. Clear the search or switch back to All." : "No texts yet. Start one with New."}
          </li>
        )}
      </ul>
    </aside>
  );
}
