"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { SettingsSchema } from "@/server/settings";

export async function saveMarketingSettings(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  const on = (k: string) => f.get(k) === "on", n = (k: string) => String(f.get(k) ?? "").trim() || undefined; // blank number = keep the default
  const parsed = SettingsSchema.safeParse({
    ...(biz.settings as object), reviewRequests: on("reviewRequests"), reviewDelayHours: Number(f.get("reviewDelayHours") || 24),
    referralRewardCents: Math.round(Number(f.get("referralReward") || 0) * 100), referralDiscountCents: Math.round(Number(f.get("referralDiscount") || 0) * 100),
    reviewTrigger: f.get("reviewTrigger") === "every" ? "every" : "first", reviewCapMonths: n("reviewCapMonths"), reviewRatedMonths: n("reviewRatedMonths"),
    reviewFollowUp: on("reviewFollowUp"), reviewFollowUpDays: n("reviewFollowUpDays"),
    missedCallText: on("missedCallText"), missedCallFromHour: n("missedCallFromHour"), missedCallToHour: n("missedCallToHour"),
    skipNotice: on("skipNotice"), skipNoticeReasons: f.getAll("skipNoticeReasons").map(String),
  });
  const bad = !parsed.success ? "Check the numbers: one of them is out of range" : parsed.data.missedCallFromHour >= parsed.data.missedCallToHour ? "Missed-call texts: the start hour has to be before the end hour" : null;
  if (bad || !parsed.success) redirect(`/marketing?error=${encodeURIComponent(bad ?? "")}`);
  await db.business.update({ where: { id: biz.id }, data: { settings: parsed.data as Prisma.InputJsonValue } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}
