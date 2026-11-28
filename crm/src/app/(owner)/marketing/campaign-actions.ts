"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { fromLocalInput } from "@/server/dates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { Audience, Block, cancelCampaign, duplicateCampaign, sendCampaign } from "@/server/ops/campaigns";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function campaignNew(f: FormData) {
  const user = await requireOwner();
  const c = await db.campaign.create({ data: { businessId: user.businessId, name: str(f, "name") || "New campaign", channel: str(f, "channel") === "SMS" ? "SMS" : "EMAIL", createdById: user.id,
    blocks: [{ type: "heading", text: "Hi {first_name}!", url: "" }, { type: "text", text: "", url: "" }, { type: "button", text: "Book now", url: `${env.siteUrl}/book.html` }] } });
  redirect(`/marketing/campaigns/${c.id}`);
}

function audienceFrom(f: FormData) {
  return Audience.parse({
    status: str(f, "a_status") || "any", tags: f.getAll("a_tag").map(String), communities: f.getAll("a_community").map(String), service: str(f, "a_service"),
    lastVisitBefore: str(f, "a_before"), lastVisitAfter: str(f, "a_after"), hasSnowPlan: str(f, "a_plan") || "any", hasOpenQuote: str(f, "a_quote") || "any",
  });
}

export async function campaignSave(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  const c = await db.campaign.findFirstOrThrow({ where: { id, businessId: user.businessId, automation: null } });
  if (c.status !== "DRAFT") redirect(`/marketing/campaigns/${id}`);
  const blocks = z.array(Block).max(30).parse(JSON.parse(str(f, "blocks") || "[]"));
  await db.campaign.update({ where: { id }, data: {
    name: str(f, "name").slice(0, 120) || c.name, subject: str(f, "subject").slice(0, 200) || null, smsBody: str(f, "smsBody").slice(0, 600) || null,
    blocks: blocks as Prisma.InputJsonValue, audience: audienceFrom(f) as Prisma.InputJsonValue,
  } });
  const next = str(f, "next");
  if (next === "test" || next === "send") {
    try {
      const r = await sendCampaign(user, id, next === "test" ? { testTo: env.ownerEmails } : { at: str(f, "at") ? fromLocalInput(str(f, "at")) : null });
      revalidatePath("/marketing");
      redirect(`/marketing/campaigns/${id}?${next === "test" ? "tested=1" : `sent=${r.queued}&days=${r.days}`}`);
    } catch (e) {
      if (e instanceof TransitionError) redirect(`/marketing/campaigns/${id}?error=${encodeURIComponent(e.message)}`);
      throw e;
    }
  }
  redirect(`/marketing/campaigns/${id}?saved=1`);
}

/** Stop a scheduled (or still going out) campaign: whatever hasn't been sent never will be. */
export async function campaignCancel(f: FormData) {
  const user = await requireOwner();
  const id = str(f, "id");
  let stopped = 0;
  try {
    stopped = await cancelCampaign(user, id);
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/marketing/campaigns/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/marketing");
  redirect(`/marketing/campaigns/${id}?cancelled=${stopped}`);
}

/** Copy a campaign into a new draft. */
export async function campaignDuplicate(f: FormData) {
  const user = await requireOwner();
  const copy = await duplicateCampaign(user, str(f, "id")).catch((e) => { if (e instanceof TransitionError) redirect("/marketing/campaigns"); throw e; });
  redirect(`/marketing/campaigns/${copy.id}?copied=1`);
}
