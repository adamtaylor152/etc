"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AUTOMATION_KEYS, AutoConfig, getAutomation } from "@/server/ops/automations";
import { Block, sendCampaign } from "@/server/ops/campaigns";

/** Save an automated campaign's wording and numbers; `next` = save | test (to the owners) | on | off. */
export async function automationSave(f: FormData) {
  const user = await requireOwner();
  const str = (k: string) => String(f.get(k) ?? "").trim();
  const key = z.enum(AUTOMATION_KEYS).parse(str("key"));
  const path = `/marketing/automations/${key.toLowerCase()}`;
  const fail = (m: string) => redirect(`${path}?error=${encodeURIComponent(m)}`);
  const c = await getAutomation(user.businessId, key);
  const blocks = z.array(Block).max(30).safeParse(JSON.parse(str("blocks") || "[]"));
  // Numbers that aren't on this automation's form keep what they were.
  const cfg = AutoConfig.safeParse({ ...(c.audience as object), ...Object.fromEntries(["months", "daysBefore", "reminderDays"].filter((k) => str(k)).map((k) => [k, str(k)])) });
  if (!blocks.success || !cfg.success) return fail("Check the numbers and the content: something is out of range");
  const next = str("next"), subject = str("subject").slice(0, 200);
  await db.campaign.update({ where: { id: c.id }, data: { subject: subject || null, blocks: blocks.data as Prisma.InputJsonValue, audience: cfg.data as Prisma.InputJsonValue, ...(next === "off" ? { automationOn: false } : {}) } });
  if (next === "on" || next === "test") {
    const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
    if (!biz.mailingAddress) return fail("Add your business mailing address in Settings first (Canada's anti-spam law requires it in these emails)");
    if (!subject || !blocks.data.length) return fail("Add a subject and some content first");
    if (next === "test") await sendCampaign(user, c.id, { testTo: env.ownerEmails });
    else await db.campaign.update({ where: { id: c.id }, data: { automationOn: true } });
  }
  revalidatePath("/marketing");
  redirect(`${path}?${next === "test" ? "tested" : "saved"}=1`);
}
