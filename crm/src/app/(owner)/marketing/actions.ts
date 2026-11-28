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
  const next = SettingsSchema.parse({
    ...(biz.settings as object), reviewRequests: f.get("reviewRequests") === "on", reviewDelayHours: Number(f.get("reviewDelayHours") || 24),
    referralRewardCents: Math.round(Number(f.get("referralReward") || 0) * 100), referralDiscountCents: Math.round(Number(f.get("referralDiscount") || 0) * 100),
  });
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}
