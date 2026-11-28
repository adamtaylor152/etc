"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { deleteQuoteTemplate, renameQuoteTemplate } from "@/server/ops/quotes";
import * as routes from "@/server/ops/routes";
import { SETTING_DAYS, SETTING_LABELS, SettingsSchema } from "@/server/settings";
import { TransitionError } from "@/server/status/visit";
import { tiersFromRows } from "@/server/snow/tiers";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (v: string) => v || null;

export async function saveBusiness(f: FormData) {
  const user = await requireOwner();
  const num = (k: string) => (s(f, k) ? z.coerce.number().min(-180).max(180).parse(s(f, k)) : null);
  await db.business.update({
    where: { id: user.businessId },
    data: {
      name: z.string().min(1).max(80).parse(s(f, "name")), legalName: opt(s(f, "legalName")), phone: opt(s(f, "phone")),
      helpEmail: opt(s(f, "helpEmail")), etransferEmail: opt(s(f, "etransferEmail")), website: opt(s(f, "website")),
      googleReviewUrl: opt(s(f, "googleReviewUrl")), mailingAddress: opt(s(f, "mailingAddress")), depotAddress: opt(s(f, "depotAddress")), depotLat: num("depotLat"), depotLng: num("depotLng"),
    },
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=business");
}

export async function saveTax(f: FormData) {
  const user = await requireOwner();
  await db.business.update({
    where: { id: user.businessId },
    data: {
      taxRegistered: f.get("taxRegistered") === "on", taxNumber: opt(s(f, "taxNumber")),
      taxRateBps: Math.round(z.coerce.number().min(0).max(30).parse(s(f, "taxRate") || "5") * 100),
      pricesIncludeTax: f.get("pricesIncludeTax") === "on",
      defaultPaymentTerms: z.enum(["DUE_ON_RECEIPT", "NET_7", "NET_15", "NET_30"]).parse(s(f, "terms")),
    },
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=tax");
}

export async function saveAutomations(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  // The on/off settings and the follow-up days live on this form; other numbers (review delay, referral amounts) keep their values.
  const toggles = Object.fromEntries(Object.keys(SETTING_LABELS).map((k) => [k, f.get(k) === "on"]));
  const days = Object.fromEntries(Object.values(SETTING_DAYS).filter((k) => s(f, k)).map((k) => [k, s(f, k)]));
  const grace = z.coerce.number().int().min(0).max(14).safeParse(s(f, "autoPayGraceDays") || undefined);
  const fee = f.has("lateFeeDollars") ? { lateFeeCents: Math.round(Number(s(f, "lateFeeDollars") || 0) * 100), lateFeeBps: Math.round(Number(s(f, "lateFeePercent") || 0) * 100) } : {};
  const parsed = SettingsSchema.safeParse({ ...(biz.settings as object), ...toggles, ...days, ...fee, ...(grace.success ? { autoPayGraceDays: grace.data } : {}) });
  if (!parsed.success) redirect(`/settings?error=${encodeURIComponent("Days must be a whole number from 1 to 60, and the late fee no more than $1,000 plus 25%")}`);
  const next = parsed.data;
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=automations");
}

/** Route settings that aren't on/off switches (Settings › Route). */
export async function saveRouteSettings(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  const next = SettingsSchema.parse({ ...(biz.settings as object), serviceMinutes: s(f, "serviceMinutes") || undefined });
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/settings/route?saved=1");
}

/** Snow pricing (the Snow page): the depth tiers a new plan starts from, and what a billable return visit costs. */
export async function saveSnowPricing(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  let next;
  try {
    next = SettingsSchema.parse({ ...(biz.settings as object), depthTiers: tiersFromRows(f.getAll("tierCm").map(String), f.getAll("tierAdd").map(String)), returnVisitPct: s(f, "returnVisitPct") || undefined });
  } catch (e) {
    if (!(e instanceof TransitionError || e instanceof z.ZodError)) throw e;
    redirect(`/snow?error=${encodeURIComponent(e instanceof TransitionError ? e.message : "The return visit share is a whole number from 0 to 200")}`);
  }
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/snow?saved=pricing");
}

/** The order routes visit communities in: `ids` is the community codes, first to last. */
export async function saveCommunityOrder(f: FormData) {
  const user = await requireOwner();
  await routes.saveCommunityOrder(user, z.array(z.string().min(1).max(10)).max(500).parse(s(f, "ids").split(",").filter(Boolean)));
  revalidatePath("/", "layout");
  redirect("/settings/route?saved=1");
}

/** Reminder timing and the arrival windows (label + start + end, up to 6; blank rows are dropped). */
export async function saveSchedule(f: FormData) {
  const user = await requireOwner();
  const biz = await db.business.findUniqueOrThrow({ where: { id: user.businessId } });
  const labels = f.getAll("winLabel").map(String), froms = f.getAll("winFrom").map(String), tos = f.getAll("winTo").map(String), keys = f.getAll("winKey").map(String);
  const arrivalWindows = labels.map((label, i) => ({ key: keys[i] || `w${i}-${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 12)}`, label: label.trim(), from: froms[i], to: tos[i] })).filter((w) => w.label);
  const next = SettingsSchema.safeParse({ ...(biz.settings as object), reminderDaysBefore: s(f, "reminderDaysBefore"), reminderHour: s(f, "reminderHour"), arrivalWindows });
  if (!next.success) redirect(`/settings?error=${encodeURIComponent(next.error.issues[0].message)}#schedule`);
  await db.business.update({ where: { id: biz.id }, data: { settings: next.data as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=schedule#schedule");
}

export async function saveSeason(f: FormData) {
  const user = await requireOwner();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const data = {
    name: z.string().min(1).max(60).parse(s(f, "name")), startsOn: toDbDate(date.parse(s(f, "startsOn"))), endsOn: toDbDate(date.parse(s(f, "endsOn"))),
    defaultTriggerCm: z.coerce.number().int().min(0).max(50).parse(s(f, "defaultTriggerCm")),
  };
  const id = s(f, "id");
  if (id) await db.season.updateMany({ where: { id, businessId: user.businessId }, data });
  else await db.season.create({ data: { ...data, businessId: user.businessId } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=season");
}

export async function quoteTemplateRename(f: FormData) {
  const user = await requireOwner();
  const name = s(f, "name").slice(0, 80);
  if (!name) redirect(`/settings?error=${encodeURIComponent("Give the template a name")}`);
  try {
    await renameQuoteTemplate(user, s(f, "id"), name);
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/settings?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/settings?saved=templates");
}

export async function quoteTemplateDelete(f: FormData) {
  const user = await requireOwner();
  await deleteQuoteTemplate(user, s(f, "id"));
  redirect("/settings?saved=templates");
}
