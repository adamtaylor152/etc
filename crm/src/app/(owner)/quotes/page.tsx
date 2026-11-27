import type { QuoteStatus } from "@/generated/prisma/client";
import { ListPage, listHref, sortRows } from "@/components/list-page";
import { QUOTE } from "@/components/status";
import { Badge } from "@/components/ui";
import { dateOnly, localDayStart, addDays, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName } from "@/server/queries";

export const metadata = { title: "Quotes" };
const STATUSES: QuoteStatus[] = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "ARCHIVED"];
const DOT: Record<QuoteStatus, string> = { DRAFT: "bg-ink-soft/50", AWAITING_RESPONSE: "bg-amber-500", CHANGES_REQUESTED: "bg-red-600", APPROVED: "bg-emerald-600", CONVERTED: "bg-blue", ARCHIVED: "bg-ink-soft/30" };

export default async function Quotes({ searchParams }: PageProps<"/quotes">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status") ?? one("tab"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.find((s) => s === params.status);
  const all = await db.quote.findMany({ where: { businessId: await businessId() }, include: { client: true, property: true }, orderBy: { number: "desc" }, take: 1000 });
  const q = params.q?.trim().toLowerCase();
  const rows = sortRows(all.filter((x) => (status ? x.status === status : x.status !== "ARCHIVED") && (!q || `${x.number} ${x.title ?? ""} ${clientName(x.client)} ${x.property?.formatted ?? ""}`.toLowerCase().includes(q))),
    params.sort, params.dir, { client: (x) => clientName(x.client).toLowerCase(), number: (x) => x.number, created: (x) => x.createdAt.getTime(), total: (x) => x.totalCents, status: (x) => STATUSES.indexOf(x.status) });
  const since = localDayStart(addDays(todayLocal(), -30));
  const sent = all.filter((x) => x.sentAt && x.sentAt >= since);
  const won = all.filter((x) => (x.status === "APPROVED" || x.status === "CONVERTED") && x.sentAt && x.sentAt >= since);
  return (
    <ListPage
      title="Quotes" base="/quotes" params={params} newHref="/quotes/new" newLabel="New quote" searchPlaceholder="Search quotes, clients, addresses"
      overview={STATUSES.slice(0, 5).map((s) => ({ label: QUOTE[s][0], count: all.filter((x) => x.status === s).length, dot: DOT[s], active: status === s, href: listHref("/quotes", params, { status: s }) }))}
      metrics={[
        { label: "Conversion rate", value: sent.length ? `${Math.round((won.length / sent.length) * 100)}%` : "—", sub: "of quotes sent in the past 30 days" },
        { label: "Sent", value: money(sent.reduce((n, x) => n + x.totalCents, 0)), sub: `${sent.length} quotes · past 30 days` },
        { label: "Converted", value: money(won.reduce((n, x) => n + x.totalCents, 0)), sub: `${won.length} quotes · past 30 days` },
      ]}
      filters={[{ name: "status", label: "Status", value: status ?? "", options: [{ value: "", label: "All active" }, ...STATUSES.map((s) => ({ value: s, label: QUOTE[s][0] }))] }]}
      columns={[{ key: "client", label: "Client", sortable: true }, { key: "number", label: "Quote", sortable: true }, { key: "property", label: "Property", className: "hidden md:table-cell" }, { key: "created", label: "Created", sortable: true, className: "hidden sm:table-cell" }, { key: "status", label: "Status", sortable: true }, { key: "total", label: "Total", sortable: true, align: "right" }]}
      rows={rows.map((x) => ({
        id: x.id, href: `/quotes/${x.id}`,
        cells: {
          client: clientName(x.client), number: <><span className="font-semibold">#{x.number}</span> <span className="text-ink-soft">{x.title}</span></>,
          property: x.property?.formatted.split(",")[0] ?? "—", created: prettyDate(dateOnly(x.createdAt)),
          status: <Badge tone={QUOTE[x.status][1]}>{QUOTE[x.status][0]}</Badge>, total: money(x.totalCents),
        },
      }))}
      empty="No quotes match."
    />
  );
}
