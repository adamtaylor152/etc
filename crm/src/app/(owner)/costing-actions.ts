"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { addExpense, addTime, approveTime, deleteExpense, deleteTime, startTimer, stopEntry, stopTimer, unapproveTime, updateExpense, updateTime } from "@/server/ops/costing";
import { TransitionError } from "@/server/status/visit";
import { safePath } from "@/server/safe-path";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const back = (f: FormData) => { const p = str(f, "back"); return safePath(p, "/"); };
async function run(f: FormData, fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) {
    if (e instanceof TransitionError) redirect(`${back(f)}${back(f).includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(back(f).split("?")[0]);
  revalidatePath("/timesheets");
}
const cents = (f: FormData, k: string) => Math.round(Number(str(f, k) || 0) * 100);
/** "1.5", "1:30", "90m" -> minutes. */
const minutes = (s: string) => { const t = s.trim(); const hm = t.match(/^(\d+):(\d{1,2})$/); if (hm) return Number(hm[1]) * 60 + Number(hm[2]); if (/m$/i.test(t)) return Number(t.slice(0, -1)); return Math.round(Number(t) * 60); };

export async function timerStart(f: FormData) { const user = await requireOwner(); await run(f, () => startTimer(user, str(f, "visitId"))); }
export async function timerStop(f: FormData) { const user = await requireOwner(); await run(f, () => stopTimer(user)); }
export async function timeAdd(f: FormData) {
  const user = await requireOwner();
  await run(f, () => addTime(user, { userId: str(f, "userId") || user.id, jobId: str(f, "jobId") || undefined, visitId: str(f, "visitId") || undefined, date: str(f, "date"), minutes: minutes(str(f, "hours")), note: str(f, "note") }));
}
export async function timeUpdate(f: FormData) { const user = await requireOwner(); await run(f, () => updateTime(user, str(f, "id"), minutes(str(f, "hours")), str(f, "note"))); }
export async function timeDelete(f: FormData) { const user = await requireOwner(); await run(f, () => deleteTime(user, str(f, "id"))); }
export async function timeStop(f: FormData) { const user = await requireOwner(); await run(f, () => stopEntry(user, str(f, "id"))); }
const day = (f: FormData, k: string) => { const d = str(f, k); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new TransitionError("Pick a date"); return d; };
/** Approve one person's week (userId + from + to), or everyone's time up to a cutoff date (just `to`). */
export async function timeApprove(f: FormData) {
  const user = await requireOwner();
  await run(f, async () => approveTime(user, { userId: str(f, "userId") || undefined, from: str(f, "from") ? day(f, "from") : undefined, to: day(f, "to") }));
}
export async function timeUnapprove(f: FormData) {
  const user = await requireOwner();
  await run(f, async () => unapproveTime(user, { userId: str(f, "userId"), from: day(f, "from"), to: day(f, "to") }));
}
export async function expenseAdd(f: FormData) {
  const user = await requireOwner();
  const file = f.get("receipt");
  const receipt = file instanceof File && file.size > 0 ? { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type, filename: file.name } : undefined;
  await run(f, () => addExpense(user, { jobId: str(f, "jobId") || undefined, date: str(f, "date"), category: str(f, "category"), description: str(f, "description"), amountCents: cents(f, "amount"), gstCents: cents(f, "gst"), vendor: str(f, "vendor"), receipt }));
  revalidatePath("/expenses");
}
export async function expenseUpdate(f: FormData) {
  const user = await requireOwner();
  await run(f, () => updateExpense(user, str(f, "id"), { date: str(f, "date"), category: str(f, "category"), description: str(f, "description"), amountCents: cents(f, "amount"), gstCents: cents(f, "gst"), vendor: str(f, "vendor") }));
  revalidatePath("/expenses");
}
export async function expenseDelete(f: FormData) { const user = await requireOwner(); await run(f, () => deleteExpense(user, str(f, "id"))); revalidatePath("/expenses"); }
