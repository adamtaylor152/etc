import Link from "next/link";
import type { JobKind } from "@/generated/prisma/client";
import { JobBadge } from "@/components/status";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { businessId } from "@/server/db";
import { clientName, jobsWithStatus } from "@/server/queries";
import { JOB_STATUS_LABEL, type JobStatus } from "@/server/status/job";

export const metadata = { title: "Jobs" };
const KIND: Record<JobKind, string> = { ONE_OFF: "One-off", RECURRING: "Recurring", SNOW_PLAN: "Every snowfall" };
const FILTERS: (JobStatus | "ALL" | "OPEN")[] = ["OPEN", "TODAY", "LATE", "UNSCHEDULED", "UPCOMING", "REQUIRES_INVOICING", "ON_PLAN", "ACTION_REQUIRED", "ARCHIVED", "ALL"];

export default async function Jobs({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const status = FILTERS.includes(sp.status as JobStatus) ? (sp.status as (typeof FILTERS)[number]) : "OPEN";
  const kind = Object.keys(KIND).includes(String(sp.kind)) ? (sp.kind as JobKind) : undefined;
  const all = await jobsWithStatus({ businessId: await businessId(), ...(kind ? { kind } : {}) });
  const match = (s: (typeof FILTERS)[number], j: (typeof all)[number]) => s === "ALL" || (s === "OPEN" ? j.status !== "ARCHIVED" : j.status === s);
  const rows = all.filter((j) => match(status, j));
  const label = (s: (typeof FILTERS)[number]) => (s === "OPEN" ? "Open" : s === "ALL" ? "All" : JOB_STATUS_LABEL[s]);
  const q = (s: string) => `/jobs?status=${s}${kind ? `&kind=${kind}` : ""}`;
  return (
    <>
      <PageHeader title="Jobs" sub={kind ? KIND[kind] : "All kinds"} actions={<>
        {[undefined, ...Object.keys(KIND)].map((k) => (
          <Link key={k ?? "all"} href={`/jobs?status=${status}${k ? `&kind=${k}` : ""}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${kind === k ? "bg-navy text-white" : "bg-white text-ink-soft"}`}>{k ? KIND[k as JobKind] : "All"}</Link>
        ))}
      </>} />
      <Tabs active={label(status)} items={FILTERS.map((s) => ({ href: q(s), label: label(s), count: all.filter((j) => match(s, j)).length }))} />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="font-semibold">#{j.number} {clientName(j.client)}</span>
                    <span className="block truncate text-sm text-ink-soft">{j.title} · {j.property.formatted}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
                    {j.property.community && <Badge>{j.property.community.name}</Badge>}
                    <JobBadge s={j.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>No jobs here.</Empty>}
      </Card>
    </>
  );
}
