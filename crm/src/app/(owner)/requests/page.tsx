import { requireOwner } from "@/server/auth";
import type { Prisma, RequestStatus } from "@/generated/prisma/client";
import { ListPage, listHref, pageOf } from "@/components/list-page";
import { RequestBadge } from "@/components/status";
import { addDays, dateOnly, localDayStart, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { byClient, clientName, like, nameHas, numberIs, textHas, words } from "@/server/queries";

export const metadata = { title: "Requests" };
const STATUSES: RequestStatus[] = ["NEW", "ASSESSMENT_SCHEDULED", "CONVERTED", "ARCHIVED"];
const LABEL: Record<RequestStatus, string> = { NEW: "New", ASSESSMENT_SCHEDULED: "Assessment booked", CONVERTED: "Converted", ARCHIVED: "Archived" };
const DOT: Record<RequestStatus, string> = { NEW: "bg-blue", ASSESSMENT_SCHEDULED: "bg-amber-500", CONVERTED: "bg-emerald-600", ARCHIVED: "bg-ink-soft/40" };

export default async function Requests({ searchParams }: PageProps<"/requests">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.find((s) => s === params.status);
  const bid = await businessId();
  // Search, filter, sort and paging all happen in the database; the tiles count every request, not just this page.
  const ws = words(params.q);
  const bySvc = await Promise.all(ws.map((w) => db.$queryRaw<{ id: string }[]>`SELECT id FROM "Request" WHERE "businessId" = ${bid} AND array_to_string(services, ' ') ILIKE ${like(w)}`));
  const where: Prisma.RequestWhereInput = {
    businessId: bid, status: status ?? { in: ["NEW", "ASSESSMENT_SCHEDULED"] },
    AND: ws.map((w, i) => ({ OR: [...numberIs(w), { title: textHas(w) }, { client: nameHas(w) }, { property: { formatted: textHas(w) } }, { id: { in: bySvc[i].map((r) => r.id) } }] })),
  };
  const dir = params.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.RequestOrderByWithRelationInput[] = params.sort === "client" ? [...byClient(dir), { number: "desc" }] : params.sort === "number" ? [{ number: dir }] : [{ createdAt: params.sort === "created" ? dir : "desc" }, { number: "desc" }];
  const since = localDayStart(addDays(todayLocal(), -30));
  const [total, counts, fresh, converted, online] = await Promise.all([
    db.request.count({ where }),
    db.request.groupBy({ by: ["status"], where: { businessId: bid }, _count: { _all: true } }),
    db.request.count({ where: { businessId: bid, createdAt: { gte: since } } }),
    db.request.count({ where: { businessId: bid, convertedAt: { gte: since } } }),
    db.request.count({ where: { businessId: bid, createdAt: { gte: since }, source: "BOOKING_FORM" } }),
  ]);
  const at = pageOf(one("page"), total);
  const rows = await db.request.findMany({ where, include: { client: true, property: true }, orderBy, skip: at.skip, take: at.take });
  return (
    <ListPage
      title="Requests" base="/requests" params={params} at={at} newHref="/requests/new" newLabel="New request" searchPlaceholder="Search requests, clients, services"
      overview={STATUSES.map((s) => ({ label: LABEL[s], count: counts.find((c) => c.status === s)?._count._all ?? 0, dot: DOT[s], active: status === s, href: listHref("/requests", params, { status: s }) }))}
      metrics={[
        { label: "New requests", value: fresh, sub: "past 30 days" },
        { label: "Converted", value: converted, sub: "to quotes or jobs · past 30 days" },
        { label: "Booked online", value: online, sub: "from etccrew.ca · past 30 days" },
      ]}
      filters={[{ name: "status", label: "Status", value: status ?? "", options: [{ value: "", label: "Open" }, ...STATUSES.map((s) => ({ value: s, label: LABEL[s] }))] }]}
      columns={[{ key: "client", label: "Client", sortable: true }, { key: "number", label: "Request", sortable: true }, { key: "property", label: "Property", className: "hidden md:table-cell" }, { key: "created", label: "Requested", sortable: true, className: "hidden sm:table-cell" }, { key: "status", label: "Status" }]}
      rows={rows.map((r) => ({
        id: r.id, href: `/requests/${r.id}`,
        cells: {
          client: clientName(r.client), number: <><span className="font-semibold">#{r.number}</span> <span className="text-ink-soft">{r.title}</span>{r.assessmentAt && <span className="block text-xs text-ink-soft">Assessment {prettyDateTime(r.assessmentAt)}</span>}</>,
          property: r.property?.formatted.split(",")[0] ?? "—", created: prettyDate(dateOnly(r.createdAt)), status: <RequestBadge s={r.status} />,
        },
      }))}
      empty="No requests match."
    />
  );
}
