"use client";
// Conversation list: search, All/Unread/Unknown filters, the open thread highlighted.
// On phones it's its own screen (/messages); on wider screens it sits left of the open thread.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
  const tab = (f: typeof filter, label: string) => (
    <button type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-navy text-white" : "bg-tint text-ink-soft hover:text-navy"}`}>{label}</button>
  );
  return (
    <aside className={`${atList ? "flex" : "hidden md:flex"} min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white`}>
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, numbers, texts" aria-label="Search conversations"
            className="min-h-10 min-w-0 flex-1 rounded-full border border-line bg-tint px-4 text-sm" />
          <Link href="/messages/new" className="inline-flex min-h-10 items-center rounded-full bg-blue px-4 text-sm font-semibold text-white" aria-label="New message">New</Link>
        </div>
        <div className="flex gap-1.5">{tab("all", "All")}{tab("unread", `Unread${convos.some((c) => c.unread) ? ` (${convos.filter((c) => c.unread).length})` : ""}`)}{tab("unknown", "Unknown numbers")}</div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((c) => {
          const active = path === `/messages/${c.key}`;
          const unread = active ? 0 : c.unread; // opening a thread marks it read
          return (
            <li key={c.key}>
              <Link href={`/messages/${c.key}`} className={`flex items-center gap-3 border-b border-line/60 px-3 py-2.5 ${active ? "bg-blue/10" : "hover:bg-tint"}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${c.known ? "bg-navy text-white" : "bg-tint text-ink-soft"}`} aria-hidden>{initials(c.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${unread ? "font-bold" : "font-semibold"}`}>{c.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{when(c.at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${unread ? "text-navy" : "text-ink-soft"}`}>{c.failed && <span className="text-red-700">Not sent · </span>}{c.mine ? "You: " : ""}{c.preview}</span>
                    {unread > 0 && <span className="shrink-0 rounded-full bg-blue px-1.5 text-xs font-bold text-white">{unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {!shown.length && <li className="p-6 text-center text-sm text-ink-soft">{convos.length ? "Nothing matches." : "No texts yet. Tap New to start one."}</li>}
      </ul>
    </aside>
  );
}
