// Calendar of visits (month / week / list) with drag-to-reschedule and an unscheduled sidebar.
import { ScheduleCalendar } from "@/components/calendar";
import { PageHeader } from "@/components/ui";
import { addDays, dateOnly, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";

export const metadata = { title: "Schedule" };

const COLOR = { SNOW_PLAN: "#1d6fd8", ONE_OFF: "#14213d", RECURRING: "#0f766e" } as const;

export default async function Schedule() {
  const bid = await businessId();
  const today = todayLocal();
  const visits = await db.visit.findMany({
    where: {
      businessId: bid, state: { not: "CANCELLED" }, job: { closedAt: null },
      OR: [{ scheduledDate: null, state: "SCHEDULED" }, { scheduledDate: { gte: toDbDate(addDays(today, -62)), lte: toDbDate(addDays(today, 120)) } }],
    },
    include: { job: { include: { client: true } }, property: true },
  });
  const events = visits.filter((v) => v.scheduledDate).map((v) => ({
    id: v.id, date: dateOnly(v.scheduledDate)!, done: v.state === "COMPLETED" || v.state === "SKIPPED",
    title: `${v.state === "COMPLETED" ? "✓ " : v.state === "SKIPPED" ? "– " : ""}${clientName(v.job.client)} · ${v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title}`,
    color: v.scheduledDate && dateOnly(v.scheduledDate)! < today && v.state === "SCHEDULED" ? "#b91c1c" : COLOR[v.job.kind],
    editable: v.state === "SCHEDULED" && !v.snowEventId,
  }));
  const unscheduled = visits.filter((v) => !v.scheduledDate).map((v) => ({ id: v.id, title: `${clientName(v.job.client)} · ${v.job.title}`, sub: v.property.formatted }));
  return (
    <>
      <PageHeader title="Schedule" sub="Blue = snow plans, navy = one-off jobs, green = recurring, red = late." />
      <ScheduleCalendar events={events} unscheduled={unscheduled} initialDate={today} />
    </>
  );
}
