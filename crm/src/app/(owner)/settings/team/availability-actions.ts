"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { db } from "@/server/db";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const hm = /^\d{2}:\d{2}$/;

export async function hoursSave(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "userId");
  const hours: Record<string, [string, string]> = {};
  for (let d = 0; d < 7; d++) {
    const s = str(f, `s${d}`), e = str(f, `e${d}`);
    if (f.get(`on${d}`) === "on" && hm.test(s) && hm.test(e) && s < e) hours[String(d)] = [s, e];
  }
  await db.user.updateMany({ where: { id, businessId: user.businessId }, data: { workHours: hours as Prisma.InputJsonValue } });
  revalidatePath("/settings/team");
  redirect("/settings/team?saved=1#hours");
}

export async function timeOffAdd(f: FormData) {
  const user = await requireOwner();
  const start = str(f, "start"), end = str(f, "end") || start, who = str(f, "userId") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || end < start) redirect(`/settings/team?error=${encodeURIComponent("Pick the first and last day off")}#timeoff`);
  if (who) await db.user.findFirstOrThrow({ where: { id: who, businessId: user.businessId } });
  await db.timeOff.create({ data: { businessId: user.businessId, userId: who, startDate: toDbDate(start), endDate: toDbDate(end), reason: str(f, "reason").slice(0, 80) || null } });
  revalidatePath("/settings/team");
  revalidatePath("/schedule");
  redirect("/settings/team?saved=1#timeoff");
}

export async function timeOffDelete(f: FormData) {
  const user = await requireOwner();
  await db.timeOff.deleteMany({ where: { id: str(f, "id"), businessId: user.businessId } });
  revalidatePath("/settings/team");
  redirect("/settings/team#timeoff");
}
