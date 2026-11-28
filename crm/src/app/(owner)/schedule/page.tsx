// The schedule: visits, tasks, events and assessments on one calendar.
import { requireOwner } from "@/server/auth";
import { ScheduleCalendar } from "@/components/calendar";
import { ScheduleTabs } from "@/components/schedule-tabs";
import { todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { calendarItems, team } from "@/server/schedule";

export const metadata = { title: "Schedule" };

export default async function Schedule() {
  await requireOwner();
  const bid = await businessId();
  const [{ items, unscheduled }, people] = await Promise.all([calendarItems(bid), team(bid)]);
  return (
    <>
      <ScheduleTabs active="/schedule" />
      <ScheduleCalendar items={items} unscheduled={unscheduled} team={people} initialDate={todayLocal()} />
    </>
  );
}
