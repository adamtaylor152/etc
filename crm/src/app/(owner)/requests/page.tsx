import type { RequestStatus } from "@/generated/prisma/client";
import { ListPage, listHref, sortRows } from "@/components/list-page";
import { RequestBadge } from "@/components/status";
import { addDays, dateOnly, localDayStart, prettyDate, prettyDateTime, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Requests" };
const STATUSES: RequestStatus[] = ["NEW", "ASSESSMENT_SCHEDULED", "CONVERTED", "ARCHIVED"];
const LABEL: Record<RequestStatus, string> = { NEW: "New", ASSESSMENT_SCHEDULED: "Assessment booked", CONVERTED: "Converted", ARCHIVED: "Archived" };
const DOT: Record<RequestStatus, string> = { NEW: "bg-blue", ASSESSMENT_SCHEDULED: "bg-amber-500", CONVERTED: "bg-emerald-600", ARCHIVED: "bg-ink-soft/40" };

export default async function Requests({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.find((s) => s === params.status);
  const all = await db.request.findMany({ where: { businessId: await businessId() }, include: { client: true, property: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  const q = params.q?.trim().toLowerCase();
  const rows = sortRows(all.filter((r) => (status ? r.status === status : r.status === "NEW" || r.status === "ASSESSMENT_SCHEDULED") && (!q || `${r.number} ${r.title} ${clientName(r.client)} ${r.property?.formatted ?? ""} ${r.services.join(" ")}`.toLowerCase().includes(q))),
    params.sort, params.dir, { client: (r) => clientName(r.client).toLowerCase(), number: (r) => r.number, created: (r) => r.createdAt.getTime() });
  const since = localDayStart(addDays(todayLocal(), -30));
  return (
    <ListPage
      title="Requests" base="/requests" params={params} newHref="/requests/new" newLabel="New request" searchPlaceholder="Search requests, clients, services"
      overview={STATUSES.map((s) => ({ label: LABEL[s], count: all.filter((r) => r.status === s).length, dot: DOT[s], active: status === s, href: listHref("/requests", params, { status: s }) }))}
      metrics={[
        { label: "New requests", value: all.filter((r) => r.createdAt >= since).length, sub: "past 30 days" },
        { label: "Converted", value: all.filter((r) => r.convertedAt && r.convertedAt >= since).length, sub: "to quotes or jobs · past 30 days" },
        { label: "Booked online", value: all.filter((r) => r.createdAt >= since && r.source === "BOOKING_FORM").length, sub: "from etccrew.ca · past 30 days" },
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
