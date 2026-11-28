"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { saveAnswers, saveTemplate, type Answers } from "@/server/ops/checklists";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function checklistSave(f: FormData) {
  const user = await requireOwner();
  try {
    await saveTemplate(user, { id: str(f, "id") || undefined, name: str(f, "name"), items: JSON.parse(str(f, "items") || "[]"), active: f.get("active") !== "off", serviceIds: f.getAll("serviceId").map(String) });
  } catch (e) {
    if (e instanceof TransitionError || e instanceof z.ZodError) redirect(`/settings/checklists?error=${encodeURIComponent(e instanceof z.ZodError ? "Every item needs a label" : e.message)}`);
    throw e;
  }
  revalidatePath("/settings/checklists");
  redirect("/settings/checklists?saved=1");
}

export async function jobChecklistSet(f: FormData) {
  const user = await requireOwner();
  const jobId = str(f, "jobId"), templateId = str(f, "templateId") || null;
  if (templateId) await db.checklistTemplate.findFirstOrThrow({ where: { id: templateId, businessId: user.businessId } });
  await db.job.updateMany({ where: { id: jobId, businessId: user.businessId }, data: { checklistTemplateId: templateId } });
  revalidatePath(`/jobs/${jobId}`);
}

/** Field view saves the whole checklist form (inputs named a_<itemId>). */
export async function checklistAnswer(f: FormData) {
  const user = await requireOwner();
  const visitId = str(f, "visitId");
  const answers: Answers = {};
  for (const id of f.getAll("itemId").map(String)) {
    const type = str(f, `t_${id}`), v = f.get(`a_${id}`);
    answers[id] = type === "CHECKBOX" ? v === "on" : type === "NUMBER" ? (v === "" || v === null ? null : Number(v)) : v === null ? null : String(v);
  }
  try { await saveAnswers(user, visitId, answers); } catch (e) {
    if (e instanceof TransitionError) redirect(`/visits/${visitId}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/visits/${visitId}`);
}
