import { getSettings } from "@/server/settings";
import { requireOwner } from "@/server/auth";
import { notFound } from "next/navigation";
import { DetailHeader } from "@/components/detail-header";
import { TaskForm } from "@/components/task-form";
import { Check } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { dateOnly } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { team } from "@/server/schedule";
import { taskDone } from "../../schedule-actions";

export const metadata = { title: "Task" };
const hm = (d: Date | null) => (d ? d.toLocaleTimeString("en-CA", { timeZone: "America/Edmonton", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "");

export default async function TaskPage({ params, searchParams }: PageProps<"/tasks/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const t = await db.task.findFirst({ where: { id, businessId: bid }, include: { assignees: true } });
  if (!t) notFound();
  const [client, people] = await Promise.all([t.clientId ? db.client.findFirst({ where: { id: t.clientId, businessId: bid } }) : null, team(bid)]);
  const back = typeof sp.back === "string" ? sp.back : "/tasks";
  return (
    <>
      <DetailHeader back={{ href: back, label: "Back" }} kind={t.kind === "EVENT" ? "Event" : "Task"} status={t.completedAt ? <Badge tone="green">Done</Badge> : t.seriesId ? <Badge>Repeats</Badge> : undefined} title={t.title}
        actions={<form action={taskDone}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.completedAt ? "0" : "1"} /><Button variant="secondary">{!t.completedAt && <Check className="size-4" strokeWidth={1.75} aria-hidden />}{t.completedAt ? "Mark not done" : "Mark done"}</Button></form>} />
      <TaskForm windows={(await getSettings(db, bid)).arrivalWindows} back={back} error={typeof sp.error === "string" ? sp.error : undefined} team={people} client={client && { id: client.id, name: clientName(client) }}
        d={{ id: t.id, kind: t.kind, title: t.title, instructions: t.instructions ?? "", clientId: t.clientId ?? "", jobId: t.jobId ?? "", date: dateOnly(t.date) ?? "",
          startTime: t.allDay ? "" : hm(t.startAt), endTime: t.allDay ? "" : hm(t.endAt), allDay: t.allDay, repeat: t.repeat ?? "", assigneeIds: t.assignees.map((a) => a.userId), series: !!t.seriesId }} />
    </>
  );
}
