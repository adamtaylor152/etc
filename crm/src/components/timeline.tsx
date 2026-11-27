import type { ActivityEvent, Note } from "@/generated/prisma/client";
import { prettyDateTime } from "@/server/dates";
import { addNote } from "@/app/(owner)/actions";
import { Button, Card, Textarea } from "./ui";

const LABEL: Record<string, string> = {
  "booking.received": "Booked online", "booking.imported": "Imported from the old booking system",
  "request.archived": "Request archived", "request.unarchived": "Request unarchived",
  "job.created": "Job created", "job.closed": "Job closed", "job.reopened": "Job reopened",
  "plan.created": "Snow plan started", "plan.updated": "Snow plan changed", "plan.paused": "Snow plan paused", "plan.resumed": "Snow plan resumed",
  "visit.en_route": "On the way", "visit.in_progress": "Arrived", "visit.completed": "Visit done", "visit.skipped": "Visit skipped",
  "invoice.created": "Invoice created", "invoice.sent": "Invoice sent", "invoice.voided": "Invoice voided",
  "payment.received": "Payment received", "payment.deleted": "Payment removed",
  "storm.created": "Storm created", "storm.started": "Storm started", "storm.depth": "Storm depth changed", "storm.push": "Another push added",
  "storm.finished": "Storm finished", "storm.cancelled": "Storm cancelled",
  "visit.scheduled": "Visit reopened", "visit.cancelled": "Visit cancelled", "visit.scheduled_for": "Visit rescheduled",
};

/** Notes + activity merged newest-first, with a note box. */
export function Timeline({ notes, events, target, path }: {
  notes: Note[]; events: ActivityEvent[]; target: { clientId?: string; jobId?: string; requestId?: string }; path: string;
}) {
  const items = [
    ...notes.map((n) => ({ at: n.createdAt, key: n.id, note: n.body })),
    ...events.map((e) => ({ at: e.at, key: e.id, note: null as string | null, label: LABEL[e.type] ?? e.type })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <Card title="Notes & timeline">
      <form action={addNote} className="mb-4 space-y-2">
        {Object.entries(target).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="path" value={path} />
        <Textarea name="body" rows={2} placeholder="Add an internal note (gate code, dog, where to leave cash…)" required />
        <Button variant="secondary">Add note</Button>
      </form>
      <ol className="space-y-3">
        {items.map((i) => (
          <li key={i.key} className="text-sm">
            <div className="text-xs text-ink-soft">{prettyDateTime(i.at)}</div>
            {i.note ? <p className="whitespace-pre-line rounded-xl bg-amber-50 p-2.5">{i.note}</p> : <p className="font-medium">{"label" in i ? i.label : ""}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
