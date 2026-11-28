import { getSettings } from "@/server/settings";
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { TaskForm } from "@/components/task-form";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { team } from "@/server/schedule";

export const metadata = { title: "New task" };

export default async function NewTask({ searchParams }: PageProps<"/tasks/new">) {
  await requireOwner();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const bid = await businessId();
  const [client, people] = await Promise.all([s("client") ? db.client.findFirst({ where: { id: s("client"), businessId: bid } }) : null, team(bid)]);
  const time = s("time");
  const plusHour = time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, "0")}${time.slice(2)}` : "";
  const back = s("back") || (s("client") ? `/clients/${s("client")}` : s("date") ? "/schedule" : "/tasks");
  return (
    <>
      <DetailHeader back={{ href: back, label: "Back" }} title={s("kind") === "EVENT" ? "New calendar event" : "New task"} />
      <TaskForm windows={(await getSettings(db, bid)).arrivalWindows} back={back} error={s("error") || undefined} team={people} client={client && { id: client.id, name: clientName(client) }}
        d={{ kind: s("kind") === "EVENT" ? "EVENT" : "TASK", title: "", instructions: "", clientId: client?.id ?? "", jobId: s("job"), date: s("date"), startTime: time, endTime: plusHour, allDay: !time, repeat: "", assigneeIds: [], series: false }} />
    </>
  );
}
