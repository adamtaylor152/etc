"use client";
// Recurrence form fields (every N weeks on weekdays / every N months on a day or nth weekday / as needed, with an end),
// used on new + edit recurring job. Posts freq, interval, byDay[], monthMode, monthDay, nth, nthDay, startsOn, endMode, endsOn, count
// (read by repeatFrom in recurring-actions.ts).
import { useState } from "react";
import { Field, Input, inputCls } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type RepeatValue = { freq?: string; interval?: number; byDay?: number[]; monthDay?: number | null; nth?: number | null; startsOn: string; endsOn?: string | null; count?: number | null };

export function RepeatFields({ freq: freq0 = "WEEKLY", interval = 1, byDay = [], monthDay, nth, startsOn, endsOn, count }: RepeatValue) {
  const [freq, setFreq] = useState(freq0 === "BIWEEKLY" ? "WEEKLY" : freq0);
  const [monthMode, setMonthMode] = useState(freq0 === "MONTHLY" && byDay.length && !monthDay ? "NTH" : "DAY");
  const [endMode, setEndMode] = useState(count ? "AFTER" : endsOn ? "ON" : "NEVER");
  const small = `${inputCls} w-auto`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {freq !== "AS_NEEDED" && <label className="text-sm font-semibold">Every<Input name="interval" type="number" min={1} max={52} defaultValue={freq0 === "BIWEEKLY" ? 2 : interval} className="mt-1 block w-20" aria-label="Every how many" /></label>}
        <label className="text-sm font-semibold">Repeats
          <select name="freq" value={freq} onChange={(e) => setFreq(e.target.value)} className={`${small} mt-1 block`}>
            <option value="WEEKLY">week(s)</option><option value="MONTHLY">month(s)</option><option value="AS_NEEDED">As needed (no automatic visits)</option>
          </select>
        </label>
      </div>
      {freq === "WEEKLY" && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">On</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-sm">
                <input type="checkbox" name="byDay" value={i} defaultChecked={freq0 !== "MONTHLY" && byDay.includes(i)} className="size-4" /> {d}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">None ticked = the start date&apos;s weekday.</p>
        </fieldset>
      )}
      {freq === "MONTHLY" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select name="monthMode" value={monthMode} onChange={(e) => setMonthMode(e.target.value)} className={small} aria-label="Monthly on">
            <option value="DAY">On day</option><option value="NTH">On the</option>
          </select>
          {monthMode === "DAY" ? (
            <select name="monthDay" defaultValue={monthDay ?? Math.min(28, Number(startsOn.slice(8)) || 1)} className={small} aria-label="Day of the month">
              {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}<option value={-1}>Last day</option>
            </select>
          ) : (
            <>
              <select name="nth" defaultValue={nth ?? 1} className={small} aria-label="Which one">
                <option value={1}>first</option><option value={2}>second</option><option value={3}>third</option><option value={4}>fourth</option><option value={-1}>last</option>
              </select>
              <select name="nthDay" defaultValue={freq0 === "MONTHLY" ? byDay[0] ?? 0 : 0} className={small} aria-label="Weekday">{LONG.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
            </>
          )}
          <span className="text-ink-soft">of the month</span>
        </div>
      )}
      {freq !== "AS_NEEDED" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Starting"><Input type="date" name="startsOn" defaultValue={startsOn} required /></Field>
          <Field label="Ends">
            <select name="endMode" value={endMode} onChange={(e) => setEndMode(e.target.value)} className={inputCls}>
              <option value="NEVER">Never</option><option value="ON">On a date</option><option value="AFTER">After a number of visits</option>
            </select>
          </Field>
          {endMode === "ON" && <Field label="Last day"><Input type="date" name="endsOn" defaultValue={endsOn ?? ""} required /></Field>}
          {endMode === "AFTER" && <Field label="Visits"><Input type="number" name="count" min={1} max={500} defaultValue={count ?? 10} required /></Field>}
        </div>
      )}
      <p className="text-xs text-ink-soft">Visits are created 90 days ahead.</p>
    </div>
  );
}
