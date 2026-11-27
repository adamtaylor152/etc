// The schedule: visits, tasks, events and assessments on one calendar.
import { ScheduleCalendar } from "@/components/calendar";
import { todayLocal } from "@/server/dates";
import { businessId } from "@/server/db";
import { calendarItems, team } from "@/server/schedule";

export const metadata = { title: "Schedule" };

export default async function Schedule() {
  const bid = await businessId();
  const [{ items, unscheduled }, people] = await Promise.all([calendarItems(bid), team(bid)]);
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-bold sm:text-3xl">Schedule</h1>
      <ScheduleCalendar items={items} unscheduled={unscheduled} team={people} initialDate={todayLocal()} />
    </>
  );
}
