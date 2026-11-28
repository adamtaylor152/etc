import { requireOwner } from "@/server/auth";
import type { JobKind } from "@/generated/prisma/client";
import { ListPage, listHref, pageOf, sortRows } from "@/components/list-page";
import { JobBadge } from "@/components/status";
import { addDays, dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName, inOrder, jobStatuses, jobsWithStatus, nameHas, numberIs, textHas, words } from "@/server/queries";
import { JOB_STATUS_LABEL, type JobStatus } from "@/server/status/job";

export const metadata = { title: "Jobs" };
const KIND: Record<JobKind, string> = { ONE_OFF: "One-off", RECURRING: "Recurring", SNOW_PLAN: "Every snowfall" };
const STATUSES: JobStatus[] = ["LATE", "TODAY", "UNSCHEDULED", "UPCOMING", "REQUIRES_INVOICING", "ACTION_REQUIRED", "ON_PLAN", "PAUSED", "ARCHIVED"];
const DOT: Record<JobStatus, string> = {
  LATE: "bg-red-600", TODAY: "bg-navy", UNSCHEDULED: "bg-amber-500", UPCOMING: "bg-blue", REQUIRES_INVOICING: "bg-amber-500",
  ACTION_REQUIRED: "bg-amber-500", ON_PLAN: "bg-emerald-600", PAUSED: "bg-ink-soft/50", ARCHIVED: "bg-ink-soft/50",
};

export default async function Jobs({ searchParams }: PageProps<"/jobs">) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), kind: one("kind"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.includes(params.status as JobStatus) || params.status === "all" ? params.status! : "open";
  const kind = params.kind && params.kind in KIND ? (params.kind as JobKind) : undefined;
  const today = todayLocal();
  const bid = await businessId();
  // Status is computed, not stored: read just what status and sorting need for every job of this type (jobStatuses),
  // let the database do the search, then load the full rows for the one page shown.
  const ws = words(params.q);
  const [all, found] = await Promise.all([
    jobStatuses({ businessId: bid, ...(kind ? { kind } : {}) }, today),
    ws.length ? db.job.findMany({
      where: { businessId: bid, AND: ws.map((w) => ({ OR: [...numberIs(w), { title: textHas(w) }, { client: nameHas(w) }, { property: { formatted: textHas(w) } }] })) }, select: { id: true },
    }) : null,
  ]);
  const hit = found && new Set(found.map((j) => j.id));
  const nextVisit = (j: { visits: (typeof all)[number]["visits"] }) => j.visits.filter((v) => v.scheduledDate && ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state))
    .map((v) => v.scheduledDate!).sort()[0] ?? null;
  const matches = all.filter((j) => (status === "all" || (status === "open" ? j.status !== "ARCHIVED" : j.status === status)) && (!hit || hit.has(j.id)));
  const sorted = sortRows(matches, params.sort, params.dir, {
    client: (j) => clientName(j.client).toLowerCase(), number: (j) => j.number, next: nextVisit, status: (j) => STATUSES.indexOf(j.status),
  });
  const at = pageOf(one("page"), sorted.length);
  const ids = sorted.slice(at.skip, at.skip + at.take).map((j) => j.id);
  const rows = inOrder(ids, await jobsWithStatus({ id: { in: ids } }, today));
  const in30 = addDays(today, 30);
  const count = (s: JobStatus) => all.filter((j) => j.status === s).length;
  return (
    <ListPage
      title="Jobs" base="/jobs" params={params} at={at} newHref="/jobs/new" newLabel="New job" searchPlaceholder="Search jobs, clients, addresses"
      overview={["LATE", "TODAY", "UNSCHEDULED", "REQUIRES_INVOICING", "ACTION_REQUIRED", "UPCOMING", "ON_PLAN"].map((s) => ({
        label: JOB_STATUS_LABEL[s as JobStatus], count: count(s as JobStatus), dot: DOT[s as JobStatus], active: status === s,
        href: listHref("/jobs", params, { status: s, q: undefined }),
      }))}
      metrics={[
        { label: "Visits in the next 30 days", value: all.reduce((n, j) => n + j.visits.filter((v) => { const d = v.scheduledDate; return d && d >= today && d <= in30 && v.state === "SCHEDULED"; }).length, 0), sub: `through ${prettyDate(in30)}` },
        { label: "Requires invoicing", value: count("REQUIRES_INVOICING"), sub: "jobs with unbilled work", href: "/billing" },
        { label: "Snow plans", value: all.filter((j) => j.kind === "SNOW_PLAN" && j.status !== "ARCHIVED").length, sub: `${count("PAUSED")} paused`, href: listHref("/jobs", {}, { kind: "SNOW_PLAN" }) },
      ]}
      filters={[
        { name: "status", label: "Status", value: status === "open" ? "" : status, options: [{ value: "", label: "All open" }, ...STATUSES.map((s) => ({ value: s, label: JOB_STATUS_LABEL[s] })), { value: "all", label: "Everything" }] },
        { name: "kind", label: "Type", value: kind ?? "", options: [{ value: "", label: "All types" }, ...Object.entries(KIND).map(([value, label]) => ({ value, label }))] },
      ]}
      columns={[
        { key: "client", label: "Client", sortable: true },
        { key: "number", label: "Job", sortable: true },
        { key: "property", label: "Property", className: "hidden md:table-cell" },
        { key: "next", label: "Next visit", sortable: true, className: "hidden sm:table-cell" },
        { key: "status", label: "Status", sortable: true },
      ]}
      rows={rows.map((j) => {
        const nv = nextVisit({ visits: j.visits.map((v) => ({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) })) });
        return {
          id: j.id, href: `/jobs/${j.id}`,
          cells: {
            client: clientName(j.client),
            number: <><span className="font-semibold tabular-nums">#{j.number}</span> <span className="text-ink-soft">{j.title}</span><span className="block text-xs text-ink-soft">{KIND[j.kind]}</span></>,
            property: <>{j.property.formatted.split(",")[0]}{j.property.community && <span className="block text-xs text-ink-soft">{j.property.community.name}</span>}</>,
            next: nv ? <span className="whitespace-nowrap tabular-nums">{prettyDate(nv)}</span> : <span className="text-ink-soft" aria-label="No visit scheduled">—</span>,
            status: <JobBadge s={j.status} />,
          },
        };
      })}
      empty="No jobs match. Try another status or type, or clear the search."
    />
  );
}
