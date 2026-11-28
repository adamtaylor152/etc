"use server";
// Owner mutations. Every action re-checks the session (server actions are public POST endpoints).
import { adoptTexts } from "@/server/ops/texts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { logActivity } from "@/server/records";

export async function setRequestArchived(form: FormData) {
  const user = await requireOwner();
  const id = String(form.get("id"));
  const archive = form.get("archive") === "1";
  const r = await db.request.findFirstOrThrow({ where: { id, businessId: user.businessId } });
  if (!archive && r.status !== "ARCHIVED") return;
  await db.$transaction(async (tx) => {
    await tx.request.update({
      where: { id }, data: archive ? { status: "ARCHIVED", archivedAt: new Date(), lostReason: String(form.get("reason") ?? "").trim().slice(0, 200) || null } : { status: r.convertedAt ? "CONVERTED" : "NEW", archivedAt: null, lostReason: null },
    });
    await logActivity(tx, { businessId: user.businessId, type: archive ? "request.archived" : "request.unarchived", entityType: "Request", entityId: id, actorType: "USER", actorUserId: user.id, clientId: r.clientId });
  });
  revalidatePath(`/requests/${id}`);
}

const ClientForm = z.object({
  id: z.string(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  companyName: z.string().trim().max(150),
  email: z.email().trim().toLowerCase().max(200),
  phone: z.string().trim().max(40),
  tags: z.string().trim().max(300),
  notes: z.string().trim().max(5000),
  marketingOptOut: z.boolean(),
  smsOptIn: z.boolean(),
});

export async function updateClient(form: FormData) {
  const user = await requireOwner();
  const f = ClientForm.parse({ ...Object.fromEntries(form), marketingOptOut: form.get("marketingOptOut") === "on", smsOptIn: form.get("smsOptIn") === "on" });
  await db.client.findFirstOrThrow({ where: { id: f.id, businessId: user.businessId } });
  await db.client.update({
    where: { id: f.id },
    data: {
      firstName: f.firstName, lastName: f.lastName, companyName: f.companyName || null, email: f.email, phone: f.phone || null,
      notes: f.notes || null, marketingOptOut: f.marketingOptOut, smsOptIn: f.smsOptIn,
      tags: [...new Set(f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))],
    },
  });
  await adoptTexts(user.businessId, f.id, f.phone); // earlier texts from this number join the client's conversation
  revalidatePath(`/clients/${f.id}`);
}

