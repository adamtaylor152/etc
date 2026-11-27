// Right-hand column for a job/quote/invoice/request: internal notes (incl. the client's linked notes) + that record's activity.
import { activityFeed } from "@/server/activity";
import { notesFor, type NoteTarget } from "@/server/ops/notes";
import { ActivityFeed } from "./activity-feed";
import { NotesCard } from "./notes-card";

export async function RecordPanel({ businessId, target, clientId, path }: { businessId: string; target: NoteTarget; clientId: string; path: string }) {
  const [notes, feed] = await Promise.all([
    notesFor(businessId, { ...target, clientIdForDownstream: clientId }),
    activityFeed({ businessId, ...target }, { types: ["work", "money"], limit: 40 }),
  ]);
  return (
    <div className="space-y-5">
      <NotesCard notes={notes} target={target} path={path} />
      <section className="rounded-lg border border-line bg-white p-4 shadow-card">
        <h2 className="mb-3 text-base font-bold">Activity</h2>
        <ActivityFeed items={feed} base={path} types={["work", "money"]} hideChips />
      </section>
    </div>
  );
}
