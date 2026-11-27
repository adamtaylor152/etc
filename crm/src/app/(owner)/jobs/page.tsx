import type { JobKind } from "@/generated/prisma/client";
import { ListPage, listHref, sortRows } from "@/components/list-page";
import { JobBadge } from "@/components/status";
import { addDays, dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { clientName, jobsWithStatus } from "@/server/queries";
import { JOB_STATUS_LABEL, type JobStatus } from "@/server/status/job";

export const metadata = { title: "Jobs" };
const KIND: Record<JobKind, string> = { ONE_OFF: "One-off", RECURRING: "Recurring", SNOW_PLAN: "Every snowfall" };
const STATUSES: JobStatus[] = ["LATE", "TODAY", "UNSCHEDULED", "UPCOMING", "REQUIRES_INVOICING", "ACTION_REQUIRED", "ON_PLAN", "PAUSED", "ARCHIVED"];
const DOT: Record<JobStatus, string> = {
  LATE: "bg-red-600", TODAY: "bg-navy", UNSCHEDULED: "bg-amber-500", UPCOMING: "bg-blue", REQUIRES_INVOICING: "bg-amber-500",
  ACTION_REQUIRED: "bg-amber-500", ON_PLAN: "bg-emerald-600", PAUSED: "bg-ink-soft/50", ARCHIVED: "bg-ink-soft/50",
};

export default async function Jobs({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const params = { status: one("status"), kind: one("kind"), q: one("q"), sort: one("sort"), dir: one("dir") };
  const status = STATUSES.includes(params.status as JobStatus) || params.status === "all" ? params.status! : "open";
  const kind = params.kind && params.kind in KIND ? (params.kind as JobKind) : undefined;
  const today = todayLocal();
  const all = await jobsWithStatus({ businessId: await businessId(), ...(kind ? { kind } : {}) }, today);
  const nextVisit = (j: (typeof all)[number]) => j.visits.filter((v) => v.scheduledDate && ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"].includes(v.state))
    .map((v) => dateOnly(v.scheduledDate)!).sort()[0] ?? null;
  const q = params.q?.trim().toLowerCase();
  const matches = all.filter((j) => (status === "all" || (status === "open" ? j.status !== "ARCHIVED" : j.status === status))
    && (!q || `${j.number} ${j.title} ${clientName(j.client)} ${j.property.formatted}`.toLowerCase().includes(q)));
  const rows = sortRows(matches, params.sort, params.dir, {
    client: (j) => clientName(j.client).toLowerCase(), number: (j) => j.number, next: nextVisit, status: (j) => STATUSES.indexOf(j.status),
  });
  const in30 = addDays(today, 30);
  const count = (s: JobStatus) => all.filter((j) => j.status === s).length;
  return (
    <ListPage
      title="Jobs" base="/jobs" params={params} newHref="/jobs/new" newLabel="New job" searchPlaceholder="Search jobs, clients, addresses"
      overview={["LATE", "TODAY", "UNSCHEDULED", "REQUIRES_INVOICING", "ACTION_REQUIRED", "UPCOMING", "ON_PLAN"].map((s) => ({
        label: JOB_STATUS_LABEL[s as JobStatus], count: count(s as JobStatus), dot: DOT[s as JobStatus], active: status === s,
        href: listHref("/jobs", params, { status: s, q: undefined }),
      }))}
      metrics={[
        { label: "Visits in the next 30 days", value: all.reduce((n, j) => n + j.visits.filter((v) => { const d = dateOnly(v.scheduledDate); return d && d >= today && d <= in30 && v.state === "SCHEDULED"; }).length, 0), sub: `through ${prettyDate(in30)}` },
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
        const nv = nextVisit(j);
        return {
          id: j.id, href: `/jobs/${j.id}`,
          cells: {
            client: clientName(j.client),
            number: <><span className="font-semibold">#{j.number}</span> <span className="text-ink-soft">{j.title}</span><span className="block text-xs text-ink-soft">{KIND[j.kind]}</span></>,
            property: <>{j.property.formatted.split(",")[0]}{j.property.community && <span className="block text-xs text-ink-soft">{j.property.community.name}</span>}</>,
            next: nv ? prettyDate(nv) : <span className="text-ink-soft">—</span>,
            status: <JobBadge s={j.status} />,
          },
        };
      })}
      empty="No jobs match. Try another filter."
    />
  );
}
