// The unified activity feed: filter chips by type, rows grouped by day, object icon + colour.
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Banknote, CalendarCheck, FileText, Hammer, Inbox, Mail, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Receipt, Snowflake, StickyNote, User,
} from "lucide-react";
import { FEED_TYPES, type FeedItem, type FeedType } from "@/server/activity";

const LABEL: Record<FeedType, string> = { work: "Work", money: "Money", text: "Texts", call: "Calls", note: "Notes", email: "Emails" };
const ICON: Record<FeedItem["object"], [ReactNode, string]> = {
  request: [<Inbox key="i" className="size-4" />, "bg-orange-100 text-orange-800"], quote: [<FileText key="i" className="size-4" />, "bg-rose-100 text-rose-800"],
  job: [<Hammer key="i" className="size-4" />, "bg-emerald-100 text-emerald-800"], visit: [<CalendarCheck key="i" className="size-4" />, "bg-emerald-100 text-emerald-800"],
  invoice: [<Receipt key="i" className="size-4" />, "bg-blue/10 text-blue"], payment: [<Banknote key="i" className="size-4" />, "bg-blue/10 text-blue"],
  client: [<User key="i" className="size-4" />, "bg-tint text-navy"], storm: [<Snowflake key="i" className="size-4" />, "bg-sky/20 text-sky-800"],
  text: [<MessageSquare key="i" className="size-4" />, "bg-indigo-100 text-indigo-800"], call: [<Phone key="i" className="size-4" />, "bg-violet-100 text-violet-800"],
  note: [<StickyNote key="i" className="size-4" />, "bg-amber-100 text-amber-800"], email: [<Mail key="i" className="size-4" />, "bg-slate-100 text-slate-700"],
};
const TZ = "America/Edmonton";
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** Which feed types a ?types= value selects. Pure. */
export function parseTypes(raw: string | string[] | undefined): FeedType[] {
  const list = (Array.isArray(raw) ? raw.join(",") : raw ?? "").split(",").filter((t): t is FeedType => (FEED_TYPES as readonly string[]).includes(t));
  return list.length ? list : [...FEED_TYPES];
}

export function ActivityFeed({ items, base, types, showClient = false, moreHref, hideChips = false }: { items: FeedItem[]; base: string; types: FeedType[]; showClient?: boolean; moreHref?: string; hideChips?: boolean }) {
  const all = types.length === FEED_TYPES.length;
  const sep = base.includes("?") ? "&" : "?";
  const chip = (t: FeedType | "all") => {
    const on = t === "all" ? all : !all && types.includes(t);
    const next = t === "all" ? base : `${base}${sep}types=${t}`;
    return <Link key={t} href={next} className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-navy text-white" : "bg-tint text-ink-soft hover:text-navy"}`}>{t === "all" ? "All" : LABEL[t]}</Link>;
  };
  return (
    <div>
      {!hideChips && <div className="mb-4 flex flex-wrap gap-1.5">{chip("all")}{FEED_TYPES.map(chip)}</div>}
      {!items.length && <p className="py-8 text-center text-sm text-ink-soft">No activity yet.</p>}
      <ol className="space-y-1">
        {items.map((it, i) => {
          const d = day(it.at);
          const header = i === 0 || day(items[i - 1].at) !== d ? d : null;
          const [icon, cls] = it.object === "call"
            ? [it.tone === "red" ? <PhoneMissed key="i" className="size-4" /> : it.direction === "OUT" ? <PhoneOutgoing key="i" className="size-4" /> : <PhoneIncoming key="i" className="size-4" />, it.tone === "red" ? "bg-red-100 text-red-700" : ICON.call[1]]
            : ICON[it.object];
          const body = (
            <div className="flex gap-3 rounded-lg px-2 py-2 hover:bg-tint">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${cls}`} aria-hidden>{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={`font-semibold ${it.tone === "red" ? "text-red-700" : it.tone === "green" ? "text-emerald-700" : ""}`}>{it.title}</span>
                  {showClient && it.client && <span className="text-ink-soft">· {it.client.name}</span>}
                  <span className="ml-auto text-xs text-ink-soft">{time(it.at)}</span>
                </p>
                {it.detail && <p className="line-clamp-3 whitespace-pre-line text-sm text-ink-soft">{it.direction === "IN" && it.object === "text" ? "“" : ""}{it.detail}{it.direction === "IN" && it.object === "text" ? "”" : ""}</p>}
                {it.photos && it.photos.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {it.photos.slice(0, 4).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element -- private media
                      <img key={p} src={`/api/media/${p}/sm`} alt="" className="size-12 rounded object-cover" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
          return (
            <li key={`${it.object}:${it.id}`}>
              {header && <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft first:mt-0">{header}</h3>}
              {it.href ? <Link href={it.href}>{body}</Link> : body}
            </li>
          );
        })}
      </ol>
      {moreHref && <div className="mt-3 text-center"><Link href={moreHref} className="text-sm font-semibold text-blue">Load older activity</Link></div>}
    </div>
  );
}
