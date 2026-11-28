// Task / event form: title, notes, optional client, date + time or all day, repeat, people.
import { WindowChips } from "@/components/window-chips";
import type { Win } from "@/server/windows";
import { taskDelete, taskSave } from "@/app/(owner)/schedule-actions";
import { REPEATS } from "@/server/ops/tasks";
import type { Person } from "@/server/schedule";
import { ClientSelect } from "./client-select";
import { ConfirmButton } from "./confirm-button";
import { Flash } from "./flash";
import { btn, Button, Card, Field, Input, inputCls, Textarea } from "./ui";

export type TaskDefaults = {
  id?: string; kind: "TASK" | "EVENT"; title: string; instructions: string; clientId: string; jobId: string; date: string; startTime: string; endTime: string;
  allDay: boolean; repeat: string; assigneeIds: string[]; series: boolean;
};

// A choice chip: a real radio or checkbox inside a pill that fills in when it is the chosen one.
const chip = "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-ink-soft hover:border-ink-faint/60 hover:text-navy has-checked:border-blue/30 has-checked:bg-blue/8 has-checked:text-blue-deep has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue";
const legend = "mb-1.5 block text-sm font-semibold";

export function TaskForm({ d, client, team, back, error, windows }: { windows?: Win[]; d: TaskDefaults; client?: { id: string; name: string } | null; team: Person[]; back: string; error?: string }) {
  return (
    <div className="max-w-2xl">
      <Flash error={error} />
      <Card>
        <form action={taskSave} className="space-y-4">
          {d.id && <input type="hidden" name="id" value={d.id} />}
          <input type="hidden" name="back" value={back} />
          {d.jobId && <input type="hidden" name="jobId" value={d.jobId} />}
          <fieldset>
            <legend className={legend}>Type</legend>
            <div className="flex flex-wrap gap-2">
              <label className={chip}><input type="radio" name="kind" value="TASK" defaultChecked={d.kind === "TASK"} className="size-4" />Task</label>
              <label className={chip}><input type="radio" name="kind" value="EVENT" defaultChecked={d.kind === "EVENT"} className="size-4" />Calendar event</label>
            </div>
          </fieldset>
          <Field label="Title"><Input name="title" required defaultValue={d.title} placeholder="Pick up salt, call back Jane, day off…" /></Field>
          <Field label="Instructions"><Textarea name="instructions" rows={3} defaultValue={d.instructions} /></Field>
          <Field label="Client (optional)">
            <ClientSelect initial={client} />
          </Field>

          <div className="space-y-3 border-t border-line-soft pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date"><Input name="date" type="date" defaultValue={d.date} /></Field>
              <Field label="Start"><Input name="startTime" type="time" defaultValue={d.startTime} /></Field>
              <Field label="End"><Input name="endTime" type="time" defaultValue={d.endTime} /></Field>
            </div>
            <WindowChips windows={windows} />
            <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" name="allDay" defaultChecked={d.allDay} className="size-4" />Any time that day (no start time)</label>
            {!d.id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Repeat"><select name="repeat" defaultValue={d.repeat} className={inputCls}><option value="">Doesn&apos;t repeat</option>{Object.entries(REPEATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Repeat until" hint="Up to a year"><Input name="until" type="date" /></Field>
              </div>
            )}
          </div>

          <div className="border-t border-line-soft pt-4">
            <span className={legend}>Assign to</span>
            {team.length ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Assign to">
                {team.map((p) => <label key={p.id} className={chip}><input type="checkbox" name="userId" value={p.id} defaultChecked={d.assigneeIds.includes(p.id)} className="size-4" /><span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</label>)}
              </div>
            ) : <p className="text-sm text-ink-soft">Nobody on the team yet.</p>}
          </div>

          {d.id && d.series && (
            <div className="border-t border-line-soft pt-4">
              <span className={legend}>This task repeats. Change</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="This task repeats. Change">
                <label className={chip}><input type="radio" name="scope" value="one" defaultChecked className="size-4" />Just this one</label>
                <label className={chip}><input type="radio" name="scope" value="future" className="size-4" />This and later ones</label>
              </div>
            </div>
          )}
          <div className="border-t border-line-soft pt-4"><Button>{d.id ? "Save changes" : "Create"}</Button></div>
        </form>
      </Card>
      {d.id && (
        <form action={taskDelete} className="mt-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={back} />
          {d.series && <select name="scope" aria-label="Which ones to delete" className={`${inputCls.replace("w-full ", "")}`}><option value="one">Delete just this one</option><option value="future">Delete this and later</option></select>}
          <ConfirmButton message="Delete this task?" className={btn("danger")}>Delete</ConfirmButton>
        </form>
      )}
    </div>
  );
}
