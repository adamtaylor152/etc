import { requireOwner } from "@/server/auth";
import type { Prisma, QuoteStatus } from "@/generated/prisma/client";
import { ListPage, listHref, pageOf } from "@/components/list-page";
import { QUOTE } from "@/components/status";
import { Badge } from "@/components/ui";
import { dateOnly, localDayStart, addDays, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { byClient, clientName, nameHas, numberIs, textHas, words } from "@/server/queries";

export const metadata = { title: "Quotes" };
const STATUSES: QuoteStatus[] = ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED", "APPROVED", "CONVERTED", "DECLINED", "ARCHIVED"]; // the overview shows the first five
const DOT: Record<QuoteStatus, string> = { DRAFT: "bg-ink-soft/50", AWAITING_RESPONSE: "bg-amber-500", CHANGES_REQUESTED: "bg-red-600", APPROVED: "bg-emerald-600", CONVERTED: "bg-blue", DECLINED: "bg-red-600", ARCHIVED: "bg-ink-soft/30" };

export default async function Quotes({ searchParams }: PageProps<"/quotes">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status") ?? one("tab"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.find((s) => s === params.status);
  const bid = await businessId();
  // Search, filter, sort and paging all happen in the database; the tiles count every quote, not just this page.
  const where: Prisma.QuoteWhereInput = {
    businessId: bid, status: status ?? { not: "ARCHIVED" },
    AND: words(params.q).map((w) => ({ OR: [...numberIs(w), { title: textHas(w) }, { client: nameHas(w) }, { property: { formatted: textHas(w) } }] })),
  };
  const dir = params.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.QuoteOrderByWithRelationInput[] = params.sort === "client" ? [...byClient(dir), { number: "desc" }]
    : params.sort === "created" ? [{ createdAt: dir }] : params.sort === "total" ? [{ totalCents: dir }, { number: "desc" }]
    : params.sort === "status" ? [{ status: dir }, { number: "desc" }] : [{ number: params.sort === "number" ? dir : "desc" }];
  const since = localDayStart(addDays(todayLocal(), -30));
  const sum = { _count: { _all: true }, _sum: { totalCents: true } } as const;
  const [total, counts, sent, won] = await Promise.all([
    db.quote.count({ where }),
    db.quote.groupBy({ by: ["status"], where: { businessId: bid }, _count: { _all: true } }),
    db.quote.aggregate({ where: { businessId: bid, sentAt: { gte: since } }, ...sum }),
    db.quote.aggregate({ where: { businessId: bid, sentAt: { gte: since }, status: { in: ["APPROVED", "CONVERTED"] } }, ...sum }),
  ]);
  const at = pageOf(one("page"), total);
  const rows = await db.quote.findMany({ where, include: { client: true, property: true }, orderBy, skip: at.skip, take: at.take });
  return (
    <ListPage
      title="Quotes" base="/quotes" params={params} at={at} newHref="/quotes/new" newLabel="New quote" searchPlaceholder="Search quotes, clients, addresses"
      overview={STATUSES.slice(0, 5).map((s) => ({ label: QUOTE[s][0], count: counts.find((c) => c.status === s)?._count._all ?? 0, dot: DOT[s], active: status === s, href: listHref("/quotes", params, { status: s }) }))}
      metrics={[
        { label: "Conversion rate", value: sent._count._all ? `${Math.round((won._count._all / sent._count._all) * 100)}%` : "—", sub: "of quotes sent in the past 30 days" },
        { label: "Sent", value: money(sent._sum.totalCents ?? 0), sub: `${sent._count._all} quotes · past 30 days` },
        { label: "Converted", value: money(won._sum.totalCents ?? 0), sub: `${won._count._all} quotes · past 30 days` },
      ]}
      filters={[{ name: "status", label: "Status", value: status ?? "", options: [{ value: "", label: "All active" }, ...STATUSES.map((s) => ({ value: s, label: QUOTE[s][0] }))] }]}
      columns={[{ key: "client", label: "Client", sortable: true }, { key: "number", label: "Quote", sortable: true }, { key: "property", label: "Property", className: "hidden md:table-cell" }, { key: "created", label: "Created", sortable: true, align: "right", className: "hidden sm:table-cell" }, { key: "status", label: "Status", sortable: true }, { key: "total", label: "Total", sortable: true, align: "right" }]}
      rows={rows.map((x) => ({
        id: x.id, href: `/quotes/${x.id}`,
        cells: {
          client: clientName(x.client), number: <><span className="font-medium tabular-nums">#{x.number}</span> <span className="text-ink-soft">{x.title}</span></>,
          property: x.property?.formatted.split(",")[0] ?? <span className="text-ink-faint">—</span>, created: <span className="text-ink-soft">{prettyDate(dateOnly(x.createdAt))}</span>,
          status: <Badge tone={QUOTE[x.status][1]}>{QUOTE[x.status][0]}</Badge>, total: <span className="font-medium">{money(x.totalCents)}</span>,
        },
      }))}
      empty="No quotes match."
    />
  );
}
