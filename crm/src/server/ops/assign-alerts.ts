// Assignment alerts: when an owner puts work on someone else's day, or moves work they're on, that person gets one
// short email (and a text if their user record has a phone and texting is set up). Every path that changes who is
// on a visit or task, or when it happens, goes through here. The message is built at send time from their day as
// it stands then (src/server/runner.ts dayLines: what, where, when; never prices), and the outbox dedupe key is per
// person per day, so a bulk reschedule or a route split sends one message, not one per visit.
import { todayLocal } from "../dates";
import { db, type Db } from "../db";
import { enqueue, enqueueStaffSms } from "../email/outbox";
import { getSettings } from "../settings";

type Actor = { id: string; businessId: string };
/** What an alert cares about on a visit or task: its day, its time of day (null = any time) and who's on it. */
export type Assigned = { date: string | null; at: number | null; userIds: string[] };

const BUCKET_MS = 15 * 60_000; // changes to one person's day inside the same quarter hour share a message
const SETTLE_MS = 2 * 60_000;  // wait for the rest of a bulk change before describing the day
export const alertKey = (userId: string, date: string, now = Date.now()) => `assign:${userId}:${date}:${Math.floor(now / BUCKET_MS)}`;

/** Who to tell after a change: people newly on it, and everyone on it when its day or time moved. Pure, unit-tested. */
export function toAlert(before: Assigned | null, after: Assigned | null): string[] {
  if (!after?.date) return [];
  const moved = !before || before.date !== after.date || before.at !== after.at;
  return after.userIds.filter((id) => moved || !before.userIds.includes(id));
}

/** Queue the alert for these people's `date`. Skips the person who made the change, past days, and a switched-off setting. */
export async function alertAssigned(tx: Db, businessId: string, actorId: string | null, userIds: string[], date: string | null | undefined) {
  const ids = [...new Set(userIds)].filter((id) => id !== actorId);
  if (!ids.length || !date || date < todayLocal()) return;
  if (!(await getSettings(tx, businessId)).assignmentAlerts) return;
  const users = await tx.user.findMany({ where: { id: { in: ids }, businessId, active: true } });
  const sendAfter = new Date(Date.now() + SETTLE_MS);
  for (const u of users) {
    const dedupeKey = alertKey(u.id, date), props = { userId: u.id, date };
    await enqueue(tx, { businessId, template: "crew.assignment", to: u.email, priority: 3, props, dedupeKey, entityType: "User", entityId: u.id, sendAfter });
    await enqueueStaffSms(tx, { businessId, template: "sms.crew_assignment", user: u, props, dedupeKey: `${dedupeKey}:sms`, sendAfter });
  }
}

/** Run a change to one visit or task and alert whoever it now affects (see toAlert). `snap` reads its current state. */
export async function withAssignAlert<T>(actor: Actor, snap: () => Promise<Assigned | null>, change: () => Promise<T>): Promise<T> {
  const before = await snap();
  const out = await change();
  const after = await snap();
  await alertAssigned(db, actor.businessId, actor.id, toAlert(before, after), after?.date);
  return out;
}
