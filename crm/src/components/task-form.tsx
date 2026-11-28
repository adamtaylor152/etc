// Task / event form: title, notes, optional client, date + time or all day, repeat, people.
import { WindowChips } from "@/components/window-chips";
import type { Win } from "@/server/windows";
import { taskDelete, taskSave } from "@/app/(owner)/schedule-actions";
import { REPEATS } from "@/server/ops/tasks";
import type { Person } from "@/server/schedule";
import { ConfirmButton } from "./confirm-button";
import { Field, Input, Textarea } from "./ui";

export type TaskDefaults = {
  id?: string; kind: "TASK" | "EVENT"; title: string; instructions: string; clientId: string; jobId: string; date: string; startTime: string; endTime: string;
  allDay: boolean; repeat: string; assigneeIds: string[]; series: boolean;
};

export function TaskForm({ d, clients, team, back, error, windows }: { windows?: Win[]; d: TaskDefaults; clients: { id: string; name: string }[]; team: Person[]; back: string; error?: string }) {
  const sel = "min-h-10 w-full rounded-lg border border-line bg-white px-3";
  return (
    <div className="max-w-2xl space-y-3">
      <form action={taskSave} className="space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
        {d.id && <input type="hidden" name="id" value={d.id} />}
        <input type="hidden" name="back" value={back} />
        {d.jobId && <input type="hidden" name="jobId" value={d.jobId} />}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
        <fieldset className="flex gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="radio" name="kind" value="TASK" defaultChecked={d.kind === "TASK"} className="size-4" />Task</label>
          <label className="flex items-center gap-2"><input type="radio" name="kind" value="EVENT" defaultChecked={d.kind === "EVENT"} className="size-4" />Calendar event</label>
        </fieldset>
        <Field label="Title"><Input name="title" required defaultValue={d.title} placeholder="Pick up salt, call back Jane, day off…" /></Field>
        <Field label="Instructions"><Textarea name="instructions" rows={3} defaultValue={d.instructions} /></Field>
        <Field label="Client (optional)">
          <select name="clientId" defaultValue={d.clientId} className={sel}><option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><Input name="date" type="date" defaultValue={d.date} /></Field>
          <Field label="Start"><Input name="startTime" type="time" defaultValue={d.startTime} /></Field>
          <Field label="End"><Input name="endTime" type="time" defaultValue={d.endTime} /></Field>
        </div>
        <WindowChips windows={windows} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allDay" defaultChecked={d.allDay} className="size-4" />Any time that day (no start time)</label>
        {!d.id && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Repeat"><select name="repeat" defaultValue={d.repeat} className={sel}><option value="">Doesn&apos;t repeat</option>{Object.entries(REPEATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Repeat until" hint="Up to a year"><Input name="until" type="date" /></Field>
          </div>
        )}
        <div>
          <span className="mb-1 block text-sm font-semibold">Assign to</span>
          <div className="flex flex-wrap gap-3">
            {team.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="userId" value={p.id} defaultChecked={d.assigneeIds.includes(p.id)} className="size-4" /><span className="size-2.5 rounded-full" style={{ background: p.color }} />{p.name}</label>)}
          </div>
        </div>
        {d.id && d.series && (
          <fieldset className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="scope" value="one" defaultChecked className="size-4" />Just this one</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" value="future" className="size-4" />This and later ones</label>
          </fieldset>
        )}
        <button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white">{d.id ? "Save" : "Create"}</button>
      </form>
      {d.id && (
        <form action={taskDelete} className="flex items-center gap-3 text-sm">
          <input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={back} />
          {d.series && <select name="scope" className="h-9 rounded-lg border border-line px-2"><option value="one">Delete just this one</option><option value="future">Delete this and later</option></select>}
          <ConfirmButton message="Delete this task?" className="font-semibold text-red-700">Delete</ConfirmButton>
        </form>
      )}
    </div>
  );
}
