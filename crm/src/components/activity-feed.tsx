// The unified activity feed: filter chips by type, then a quiet timeline grouped by day.
// Each row reads left to right: time, what kind of thing, what happened, who it was about, and it links to the record.
import Link from "next/link";
import {
  Banknote, CalendarCheck, FileText, Hammer, Inbox, Mail, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Receipt, Snowflake, StickyNote, User, type LucideIcon,
} from "lucide-react";
import { FEED_TYPES, type FeedItem, type FeedType } from "@/server/activity";
import { Empty } from "./ui";

const LABEL: Record<FeedType, string> = { work: "Work", money: "Money", text: "Texts", call: "Calls", note: "Notes", email: "Emails" };
const ICON: Record<FeedItem["object"], [LucideIcon, string]> = {
  request: [Inbox, "Request"], quote: [FileText, "Quote"], job: [Hammer, "Job"], visit: [CalendarCheck, "Visit"], invoice: [Receipt, "Invoice"], payment: [Banknote, "Payment"],
  client: [User, "Client"], storm: [Snowflake, "Storm"], text: [MessageSquare, "Text"], call: [Phone, "Call"], note: [StickyNote, "Note"], email: [Mail, "Email"],
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
    return (
      <Link key={t} href={next} aria-current={on ? "true" : undefined}
        className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold ${on ? "border-blue/30 bg-blue/8 text-blue-deep" : "border-line bg-white text-ink-soft hover:border-ink-faint/60 hover:text-navy"}`}>
        {t === "all" ? "All" : LABEL[t]}
      </Link>
    );
  };
  // Group into days up front so each day is one list under its own heading.
  const days: { label: string; items: FeedItem[] }[] = [];
  for (const it of items) {
    const d = day(it.at);
    if (days.at(-1)?.label === d) days.at(-1)!.items.push(it); else days.push({ label: d, items: [it] });
  }
  return (
    <div>
      {!hideChips && <nav aria-label="Show" className="mb-4 flex flex-wrap gap-1.5">{chip("all")}{FEED_TYPES.map(chip)}</nav>}
      {!items.length && <Empty>{all ? "No activity yet. Things show up here as work is booked, done, invoiced and paid." : "Nothing of that kind yet."}</Empty>}
      <div className="space-y-4">
        {days.map((g) => (
          <section key={g.label}>
            <h3 className="mb-1 border-b border-line-soft pb-1.5 font-sans text-xs font-medium tracking-normal text-ink-soft">{g.label}</h3>
            <ol className="divide-y divide-line-soft">
              {g.items.map((it) => {
                const missed = it.object === "call" && it.tone === "red";
                const Icon = it.object === "call" ? (missed ? PhoneMissed : it.direction === "OUT" ? PhoneOutgoing : PhoneIncoming) : ICON[it.object][0];
                const quote = it.direction === "IN" && it.object === "text";
                const body = (
                  <div className={`-mx-2 flex gap-2.5 rounded-lg px-2 py-2 text-sm sm:gap-3 ${it.href ? "group-hover:bg-tint" : ""}`}>
                    <time dateTime={it.at.toISOString()} className="w-[4.25rem] shrink-0 pt-px text-right text-xs leading-5 tabular-nums text-ink-soft">{time(it.at)}</time>
                    <Icon className={`mt-0.5 size-4 shrink-0 ${it.tone === "red" ? "text-red-700" : it.tone === "green" ? "text-emerald-700" : "text-ink-faint"}`} strokeWidth={1.75} aria-label={ICON[it.object][1]} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`font-medium ${it.tone === "red" ? "text-red-700" : ""}`}>{it.title}</span>
                        {showClient && it.client && <span className="text-ink-soft">{it.client.name}</span>}
                      </p>
                      {it.detail && <p className="line-clamp-2 max-w-[70ch] whitespace-pre-line text-[13px] leading-5 text-ink-soft">{quote ? "“" : ""}{it.detail}{quote ? "”" : ""}</p>}
                      {it.photos && it.photos.length > 0 && (
                        <div className="mt-1.5 flex gap-1">
                          {it.photos.slice(0, 4).map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element -- private media
                            <img key={p} src={`/api/media/${p}/sm`} alt="" className="size-12 rounded-md object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
                return <li key={`${it.object}:${it.id}`}>{it.href ? <Link href={it.href} className="group block rounded-lg">{body}</Link> : body}</li>;
              })}
            </ol>
          </section>
        ))}
      </div>
      {moreHref && <div className="mt-4 border-t border-line-soft pt-3 text-center"><Link href={moreHref} className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold text-blue hover:bg-tint hover:text-blue-deep">Load older activity</Link></div>}
    </div>
  );
}
