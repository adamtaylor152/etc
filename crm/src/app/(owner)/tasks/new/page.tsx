import { DetailHeader } from "@/components/detail-header";
import { TaskForm } from "@/components/task-form";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { team } from "@/server/schedule";

export const metadata = { title: "New task" };

export default async function NewTask({ searchParams }: PageProps<"/tasks/new">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const bid = await businessId();
  const [clients, people] = await Promise.all([db.client.findMany({ where: { businessId: bid, archivedAt: null }, orderBy: { firstName: "asc" }, take: 3000 }), team(bid)]);
  const time = s("time");
  const plusHour = time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, "0")}${time.slice(2)}` : "";
  const back = s("back") || (s("client") ? `/clients/${s("client")}` : s("date") ? "/schedule" : "/tasks");
  return (
    <>
      <DetailHeader back={{ href: back, label: "Back" }} title={s("kind") === "EVENT" ? "New calendar event" : "New task"} />
      <TaskForm back={back} error={s("error") || undefined} team={people} clients={clients.map((c) => ({ id: c.id, name: clientName(c) }))}
        d={{ kind: s("kind") === "EVENT" ? "EVENT" : "TASK", title: "", instructions: "", clientId: s("client"), jobId: s("job"), date: s("date"), startTime: time, endTime: plusHour, allDay: !time, repeat: "", assigneeIds: [], series: false }} />
    </>
  );
}
