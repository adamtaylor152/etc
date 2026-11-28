// Job checklists: reusable templates; each visit gets a snapshot copy; required items block "Done".
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { logActivity } from "../records";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };
export const ITEM_TYPES = { CHECKBOX: "Checkbox", YESNO: "Yes / No", TEXT: "Text", NUMBER: "Number", PHOTO: "Photo" } as const;
export const Item = z.object({
  id: z.string().min(1).max(40), label: z.string().trim().min(1).max(140), type: z.enum(["CHECKBOX", "YESNO", "TEXT", "NUMBER", "PHOTO"]),
  required: z.boolean().default(false), showClient: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof Item>;
export type Answers = Record<string, string | boolean | number | null>;

export const STARTERS: { name: string; items: Omit<ChecklistItem, "id">[] }[] = [
  { name: "Snow clear", items: [
    { label: "Driveway cleared to the edges", type: "CHECKBOX", required: true, showClient: true },
    { label: "Front walk and steps cleared", type: "CHECKBOX", required: true, showClient: true },
    { label: "Ice melt applied", type: "YESNO", required: false, showClient: true },
    { label: "After photo", type: "PHOTO", required: true, showClient: false },
    { label: "Anything to flag (ice, damage, blocked access)", type: "TEXT", required: false, showClient: false },
  ] },
  { name: "Window cleaning", items: [
    { label: "Number of windows", type: "NUMBER", required: true, showClient: true },
    { label: "Screens cleaned and replaced", type: "CHECKBOX", required: false, showClient: true },
    { label: "Sills and frames wiped", type: "CHECKBOX", required: false, showClient: true },
    { label: "Before/after photo", type: "PHOTO", required: false, showClient: false },
  ] },
];

/** Labels of required items still unanswered. A PHOTO item counts as done once a photo with its tag is on the visit. Pure, unit-tested. */
export function missingRequired(items: ChecklistItem[], answers: Answers, photoTags: string[]) {
  return items.filter((i) => i.required).filter((i) => {
    if (i.type === "PHOTO") return !photoTags.includes(`checklist:${i.id}`);
    const a = answers[i.id];
    if (i.type === "CHECKBOX") return a !== true;
    if (i.type === "YESNO") return a !== "yes" && a !== "no";
    return a === null || a === undefined || String(a).trim() === "";
  }).map((i) => i.label);
}

const newId = () => Math.random().toString(36).slice(2, 10);

export async function seedStarters(businessId: string) {
  if (await db.checklistTemplate.count({ where: { businessId } })) return;
  for (const s of STARTERS) await db.checklistTemplate.create({ data: { businessId, name: s.name, items: s.items.map((i) => ({ ...i, id: newId() })) as Prisma.InputJsonValue } });
}

export async function saveTemplate(user: Actor, input: { id?: string; name: string; items: unknown; active: boolean; serviceIds: string[] }) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new TransitionError("Give the checklist a name");
  const items = z.array(Item).max(40).parse(input.items);
  if (!items.length) throw new TransitionError("Add at least one item");
  const data = { name, items: items as Prisma.InputJsonValue, active: input.active };
  const t = input.id
    ? await db.checklistTemplate.update({ where: { id: (await db.checklistTemplate.findFirstOrThrow({ where: { id: input.id, businessId: user.businessId } })).id }, data })
    : await db.checklistTemplate.create({ data: { ...data, businessId: user.businessId } });
  await db.service.updateMany({ where: { businessId: user.businessId, checklistTemplateId: t.id, id: { notIn: input.serviceIds } }, data: { checklistTemplateId: null } });
  if (input.serviceIds.length) await db.service.updateMany({ where: { businessId: user.businessId, id: { in: input.serviceIds } }, data: { checklistTemplateId: t.id } });
  return t;
}

/** Which checklist a new job gets by default: from the first line item whose service has one. */
export async function defaultChecklistFor(businessId: string, lineNames: string[]) {
  if (!lineNames.length) return null;
  const s = await db.service.findFirst({ where: { businessId, name: { in: lineNames }, checklistTemplateId: { not: null } } });
  return s?.checklistTemplateId ?? null;
}

/** The visit's checklist, creating the snapshot from the job's template the first time it's needed. */
export async function visitChecklist(businessId: string, visitId: string, tx: Tx = db) {
  const existing = await tx.visitChecklist.findUnique({ where: { visitId } });
  if (existing) return existing;
  const v = await tx.visit.findFirst({ where: { id: visitId, businessId }, include: { job: true } });
  if (!v?.job.checklistTemplateId) return null;
  const t = await tx.checklistTemplate.findFirst({ where: { id: v.job.checklistTemplateId, businessId } });
  if (!t) return null;
  return tx.visitChecklist.create({ data: { businessId, visitId, templateName: t.name, items: t.items as Prisma.InputJsonValue } });
}

const photoTags = async (tx: Tx, visitId: string) => (await tx.attachment.findMany({ where: { visitId, deletedAt: null, caption: { startsWith: "checklist:" } }, select: { caption: true } })).map((a) => a.caption!);

export async function saveAnswers(user: Actor, visitId: string, answers: Answers) {
  const vc = await visitChecklist(user.businessId, visitId);
  if (!vc) throw new TransitionError("This visit has no checklist");
  const items = vc.items as ChecklistItem[];
  const clean: Answers = {};
  for (const i of items) if (i.id in answers) clean[i.id] = typeof answers[i.id] === "string" ? String(answers[i.id]).slice(0, 1000) : answers[i.id];
  const merged = { ...(vc.answers as Answers), ...clean };
  const done = missingRequired(items, merged, await photoTags(db, visitId)).length === 0;
  await db.visitChecklist.update({ where: { visitId }, data: { answers: merged as Prisma.InputJsonValue, completedAt: done ? vc.completedAt ?? new Date() : null } });
  if (done && !vc.completedAt) {
    const v = await db.visit.findUniqueOrThrow({ where: { id: visitId }, include: { job: true } });
    await logActivity(db, { businessId: user.businessId, type: "visit.checklist_done", entityType: "Visit", entityId: visitId, actorType: "USER", actorUserId: user.id, clientId: v.job.clientId, jobId: v.jobId, data: { name: vc.templateName } });
  }
}

/** Called inside visit completion: throws if required items are missing. */
export async function assertChecklistDone(tx: Tx, businessId: string, visitId: string) {
  const vc = await visitChecklist(businessId, visitId, tx);
  if (!vc) return;
  const missing = missingRequired(vc.items as ChecklistItem[], vc.answers as Answers, await photoTags(tx, visitId));
  if (missing.length) throw new TransitionError(`Finish the checklist first: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);
}
