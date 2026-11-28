"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { db } from "@/server/db";
import { deleteQuoteTemplate, renameQuoteTemplate } from "@/server/ops/quotes";
import { SETTING_DAYS, SETTING_LABELS, SettingsSchema } from "@/server/settings";
import { TransitionError } from "@/server/status/visit";

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
  const parsed = SettingsSchema.safeParse({ ...(biz.settings as object), ...toggles, ...days });
  if (!parsed.success) redirect(`/settings?error=${encodeURIComponent("Follow-up days must be a whole number from 1 to 60")}`);
  const next = parsed.data;
  await db.business.update({ where: { id: biz.id }, data: { settings: next as Prisma.InputJsonValue } });
  revalidatePath("/", "layout");
  redirect("/settings?saved=automations");
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
