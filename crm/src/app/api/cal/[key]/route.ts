// Calendar feed for one person: their visits and tasks from a week back to 90 days ahead. No prices, no sign-in:
// the signed link is the key (see src/server/ical.ts). Turning the person inactive turns the feed off.
import { addDays, dateOnly, todayLocal, toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { feedUser, toIcs, type CalEvent } from "@/server/ical";
import { clientName } from "@/server/queries";
import { personName } from "@/server/schedule";

export async function GET(_req: Request, ctx: RouteContext<"/api/cal/[key]">) {
  const userId = feedUser((await ctx.params).key);
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user?.active) return new Response("Not found", { status: 404 });
  const today = todayLocal(), range = { gte: toDbDate(addDays(today, -7)), lte: toDbDate(addDays(today, 90)) };
  const [visits, tasks] = await Promise.all([
    db.visit.findMany({ where: { businessId: user.businessId, scheduledDate: range, state: { not: "CANCELLED" }, assignees: { some: { userId: user.id } } }, include: { job: { include: { client: true } }, property: true } }),
    db.task.findMany({ where: { businessId: user.businessId, date: range, assignees: { some: { userId: user.id } } } }),
  ]);
  const events: CalEvent[] = [
    ...visits.map((v) => ({
      uid: `visit-${v.id}`, title: `${v.job.kind === "SNOW_PLAN" ? "Snow" : v.job.title} · ${clientName(v.job.client)}`, location: v.property.formatted,
      notes: [v.instructions ?? v.job.instructions, v.property.accessNotes].filter(Boolean).join("\n") || null,
      date: dateOnly(v.scheduledDate)!, start: v.anytime ? null : v.startAt, end: v.anytime ? null : v.endAt,
    })),
    ...tasks.map((t) => ({ uid: `task-${t.id}`, title: t.title, notes: t.instructions, date: dateOnly(t.date)!, start: t.allDay ? null : t.startAt, end: t.allDay ? null : t.endAt })),
  ];
  return new Response(toIcs(`etc. · ${personName(user)}`, events), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex" } });
}
