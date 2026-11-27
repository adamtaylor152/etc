// Recurrence form fields (weekly / every 2 weeks / monthly / as needed), used on new + edit recurring job.
import { Field, Input, inputCls } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RepeatFields({ freq = "WEEKLY", byDay = [], startsOn, endsOn = "" }: { freq?: string; byDay?: number[]; startsOn: string; endsOn?: string }) {
  return (
    <div className="space-y-3">
      <Field label="Repeats">
        <select name="freq" defaultValue={freq} className={inputCls}>
          <option value="WEEKLY">Every week</option><option value="BIWEEKLY">Every 2 weeks</option>
          <option value="MONTHLY">Every month (first chosen weekday)</option><option value="AS_NEEDED">As needed (no automatic visits)</option>
        </select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">On</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-sm">
              <input type="checkbox" name="byDay" value={i} defaultChecked={byDay.includes(i)} className="size-4" /> {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starting"><Input type="date" name="startsOn" defaultValue={startsOn} required /></Field>
        <Field label="Until" hint="Blank = keeps going"><Input type="date" name="endsOn" defaultValue={endsOn} /></Field>
      </div>
      <p className="text-xs text-ink-soft">Visits are created 90 days ahead and billed monthly on the 1st.</p>
    </div>
  );
}
