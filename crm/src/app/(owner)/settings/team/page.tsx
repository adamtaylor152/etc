// Team: everyone who can sign in (by email link), with their schedule colour, cost rate, working hours and time off.
import { env } from "@/server/env";
import { feedPath } from "@/server/ical";
import { requireOwner } from "@/server/auth";
import { AddressField } from "@/components/address-field";
import { ConfirmButton } from "@/components/confirm-button";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Saved, SwitchRow } from "@/components/settings/fields";
import { Badge, Button, Card, Empty, Field, Input, inputCls } from "@/components/ui";
import { mapsKey } from "@/server/clients";
import { businessId, db } from "@/server/db";
import { personName } from "@/server/schedule";
import { teamSave } from "./actions";
import { hoursSave, timeOffAdd, timeOffDelete } from "./availability-actions";
import { dateOnly, prettyDate, todayLocal, toDbDate } from "@/server/dates";

export const metadata = { title: "Team" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COLORS = ["#1d6fd8", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d", "#0e7490", "#4b5563"];
const COLOR_NAMES: Record<string, string> = { "#1d6fd8": "Blue", "#0f766e": "Teal", "#b45309": "Amber", "#7c3aed": "Violet", "#be123c": "Rose", "#15803d": "Green", "#0e7490": "Cyan", "#4b5563": "Grey" };

export default async function Team({ searchParams }: PageProps<"/settings/team">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const users = await db.user.findMany({ where: { businessId: bid }, orderBy: { createdAt: "asc" } });
  const offs = await db.timeOff.findMany({ where: { businessId: bid, endDate: { gte: toDbDate(todayLocal()) } }, orderBy: { startDate: "asc" } });
  const key = mapsKey();
  // Route start / end: blank = the business depot. Only an address picked from the suggestions has a map pin.
  const point = (label: string, prefix: string, address?: string | null, lat?: number | null) => (
    <div>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <AddressField mapsKey={key} prefix={prefix} required={false} defaults={{ formatted: address ?? "" }} />
      <span className="mt-1 block text-xs text-ink-soft">{!address ? "Blank = the depot." : lat != null ? "Pinned on the map." : "No map pin yet (the depot is used): pick the address from the suggestions."}</span>
    </div>
  );
  // The same `color` field as before, shown as swatches. A colour that isn't one of the eight keeps its own swatch.
  const swatches = (current: string) => (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold">Colour on the schedule</legend>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5">
        {[...new Set([...COLORS, current])].map((c) => (
          <label key={c} title={COLOR_NAMES[c] ?? c} className="relative grid size-9 cursor-pointer place-items-center rounded-full max-sm:size-11">
            <input type="radio" name="color" value={c} defaultChecked={c === current} className="peer sr-only" />
            <span aria-hidden className="size-6 rounded-full ring-offset-2 ring-offset-white peer-checked:ring-2 peer-checked:ring-navy peer-focus-visible:ring-2 peer-focus-visible:ring-blue" style={{ background: c }} />
            <span className="sr-only">{COLOR_NAMES[c] ?? c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  const details = (u?: (typeof users)[number]) => (
    <form action={teamSave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {u && <input type="hidden" name="id" value={u.id} />}
      <div className="lg:col-span-2"><Field label="Name"><Input name="name" required defaultValue={u ? personName(u) : ""} /></Field></div>
      <div className="lg:col-span-2"><Field label="Email (sign-in)"><Input name="email" type="email" required defaultValue={u?.email ?? ""} /></Field></div>
      <div className="lg:col-span-2"><Field label="Phone"><Input name="phone" type="tel" defaultValue={u?.phone ?? ""} /></Field></div>
      <div className="lg:col-span-1"><Field label="Cost per hour ($)"><Input name="cost" type="number" min={0} step="0.5" defaultValue={u ? u.hourlyCostCents / 100 : ""} className="tabular-nums" /></Field></div>
      <div className="lg:col-span-2">
        <Field label="Access" hint="Crew only see their route for the day.">
          <select name="role" defaultValue={u?.role ?? "CREW"} className={inputCls}><option value="CREW">Crew</option><option value="OWNER">Owner</option></select>
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">{swatches(u?.color ?? COLORS[users.length % COLORS.length])}</div>
      <div className="sm:col-span-2 lg:col-span-3">{point("Route starts at", "start", u?.startAddress, u?.startLat)}</div>
      <div className="sm:col-span-2 lg:col-span-3">{point("Route ends at", "end", u?.endAddress, u?.endLat)}</div>
      {u && <div className="sm:col-span-2 lg:col-span-6"><SwitchRow name="active" defaultChecked={u.active} label="Active" description="Can sign in and be assigned work." /></div>}
      <div className="sm:col-span-2 lg:col-span-6"><Button>{u ? `Save ${personName(u)}` : "Add to the team"}</Button></div>
    </form>
  );
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Team" sub="Everyone here can sign in with an email link and be assigned visits and tasks. Crew only see their route for the day: no prices, billing, clients or settings. Cost per hour feeds job profit. A start and end address make their route and its ETAs run from there instead of the depot." />
      <Flash error={sp.error} />
      <Saved when={!!sp.saved} />

      <div id="hours" className="scroll-mt-20 space-y-5">
        {users.map((u) => {
          const h = (u.workHours ?? {}) as Record<string, [string, string]>;
          const feed = `${env.appUrl}${feedPath(u.id)}.ics`;
          return (
            <Card key={u.id}>
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="size-3.5 shrink-0 rounded-full" style={{ background: u.color }} aria-hidden />
                <h2 className="font-display text-[1.05rem] font-semibold">{personName(u)}</h2>
                <Badge tone={u.role === "OWNER" ? "blue" : "gray"}>{u.role === "OWNER" ? "Owner" : "Crew"}</Badge>
                {!u.active && <Badge tone="amber">Not active</Badge>}
                <span className="min-w-0 break-all text-sm text-ink-soft">{u.email}</span>
              </div>
              {details(u)}

              {u.active && (
                <form action={hoursSave} className="mt-5 border-t border-line-soft pt-4">
                  <input type="hidden" name="userId" value={u.id} />
                  <h3 className="font-display text-[0.95rem] font-semibold">Working hours</h3>
                  <p className="mb-3 text-sm text-ink-soft">Used for Find a time, conflict warnings, and shading on the Team view.</p>
                  <div className="grid max-w-md gap-2 xl:max-w-none xl:grid-cols-7">
                    {DAYS.map((d, i) => (
                      <div key={d} className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2 rounded-lg bg-tint p-2 xl:grid-cols-1">
                        <label className="flex min-h-10 items-center gap-2 text-sm font-semibold xl:min-h-8"><input type="checkbox" name={`on${i}`} defaultChecked={!!h[String(i)]} className="size-5 xl:size-4" /><span aria-hidden>{d}</span><span className="sr-only">{DAY_NAMES[i]}</span></label>
                        <input type="time" name={`s${i}`} defaultValue={h[String(i)]?.[0] ?? "08:00"} aria-label={`${DAY_NAMES[i]} start`} className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-base tabular-nums outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 max-sm:[&::-webkit-calendar-picker-indicator]:hidden sm:text-sm xl:min-h-9 xl:px-1.5" />
                        <input type="time" name={`e${i}`} defaultValue={h[String(i)]?.[1] ?? "17:00"} aria-label={`${DAY_NAMES[i]} end`} className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-base tabular-nums outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 max-sm:[&::-webkit-calendar-picker-indicator]:hidden sm:text-sm xl:min-h-9 xl:px-1.5" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3"><Button variant="secondary">Save hours</Button></div>
                </form>
              )}

              <div className="mt-5 border-t border-line-soft pt-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Calendar feed</span>
                  <input readOnly value={feed} aria-describedby={`feed-${u.id}`} className="min-h-10 w-full select-all rounded-lg border border-line bg-tint px-3 py-2 font-mono text-base outline-none focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-[13px]" />
                </label>
                <p id={`feed-${u.id}`} className="mt-1 max-w-[70ch] text-xs text-ink-soft">Click the link to select it, then copy. Add it to Google, Apple or Outlook as a subscribed calendar; anyone with this link can see {personName(u)}&apos;s schedule.</p>
              </div>
            </Card>
          );
        })}

        <Card title="Add someone">{details()}</Card>

        <Card title="Time off & closed days">
          <div id="timeoff" className="scroll-mt-24">
            {offs.length > 0 ? (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-medium text-ink-soft">
                      <th scope="col" className="py-2 pl-4 pr-3 font-medium sm:pl-5">Who</th>
                      <th scope="col" className="px-3 py-2 font-medium">Days off</th>
                      <th scope="col" className="px-3 py-2 font-medium">Reason</th>
                      <th scope="col" className="py-2 pl-3 pr-4 sm:pr-5"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {offs.map((t) => {
                      const who = t.userId ? personName(users.find((u) => u.id === t.userId) ?? { name: "?", email: "?" }) : "Everyone (closed)";
                      const from = dateOnly(t.startDate)!, to = dateOnly(t.endDate)!;
                      return (
                        <tr key={t.id}>
                          <td className="py-2 pl-4 pr-3 font-semibold sm:pl-5">{who}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{prettyDate(from)}{to !== from && ` to ${prettyDate(to)}`}</td>
                          <td className="px-3 py-2 text-ink-soft">{t.reason || "—"}</td>
                          <td className="py-1 pl-3 pr-4 text-right sm:pr-5">
                            <form action={timeOffDelete}><input type="hidden" name="id" value={t.id} />
                              <ConfirmButton message={`Remove this time off for ${who}?`} className="min-h-9 rounded-lg px-2 text-sm font-medium text-red-700 hover:bg-red-50">Remove</ConfirmButton>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Empty>No time off or closed days coming up. Add one below and it shows on the schedule and in Find a time.</Empty>}

            <form action={timeOffAdd} className="mt-4 grid items-end gap-3 rounded-lg bg-tint p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto]">
              <Field label="Who"><select name="userId" className={inputCls}><option value="">Everyone (closed)</option>{users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{personName(u)}</option>)}</select></Field>
              <Field label="First day"><Input type="date" name="start" required className="tabular-nums" /></Field>
              <Field label="Last day"><Input type="date" name="end" className="tabular-nums" /></Field>
              <Field label="Reason (optional)"><Input name="reason" /></Field>
              <div><Button variant="secondary">Add time off</Button></div>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
