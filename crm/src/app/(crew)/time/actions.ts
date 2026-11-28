"use server";
// The day clock for whoever is signed in, crew included. Acts only on the caller's own time.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { clockIn, clockOut } from "@/server/ops/costing";
import { TransitionError } from "@/server/status/visit";

async function run(fn: (user: { id: string; businessId: string }) => Promise<unknown>) {
  const user = await requireUser("/time");
  try { await fn(user); } catch (e) {
    if (e instanceof TransitionError) redirect(`/time?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/time");
  revalidatePath("/timesheets");
}

export async function clockInAction() { await run(clockIn); }
export async function clockOutAction() { await run(clockOut); }
