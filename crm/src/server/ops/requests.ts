// Requests created by hand (phone call, email, walk-up), with an optional on-site assessment.
import { db } from "../db";
import { logActivity, nextNumber } from "../records";
import { TransitionError } from "../status/visit";

type Actor = { id: string; businessId: string };

export async function createRequest(user: Actor, input: { clientId: string; propertyId?: string | null; title: string; details?: string; services: string[]; assessmentAt?: Date | null; assigneeIds?: string[] }) {
  if (!input.title.trim()) throw new TransitionError("Give the request a title");
  const client = await db.client.findFirst({ where: { id: input.clientId, businessId: user.businessId } });
  if (!client) throw new TransitionError("Pick a client");
  if (input.propertyId && !(await db.property.findFirst({ where: { id: input.propertyId, clientId: client.id } }))) throw new TransitionError("That property isn't this client's");
  return db.$transaction(async (tx) => {
    const r = await tx.request.create({
      data: {
        businessId: user.businessId, number: await nextNumber(tx, user.businessId, "REQUEST"), clientId: client.id, propertyId: input.propertyId || null,
        source: "MANUAL", status: input.assessmentAt ? "ASSESSMENT_SCHEDULED" : "NEW", title: input.title.trim().slice(0, 140),
        services: input.services.filter(Boolean).slice(0, 20), notes: input.details?.trim().slice(0, 4000) || null, assessmentAt: input.assessmentAt ?? null,
      },
    });
    // The assessment also becomes a task for whoever's going, so it lands on their day.
    if (input.assessmentAt && input.assigneeIds?.length) {
      const date = input.assessmentAt.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
      await tx.task.create({
        data: {
          businessId: user.businessId, title: `Assessment: request #${r.number}`, clientId: client.id, propertyId: input.propertyId || null, date: new Date(`${date}T00:00:00Z`),
          allDay: false, startAt: input.assessmentAt, endAt: new Date(input.assessmentAt.getTime() + 3_600_000), createdById: user.id,
          instructions: `Request #${r.number}: ${r.title}`, assignees: { create: input.assigneeIds.map((userId) => ({ userId })) },
        },
      });
    }
    await logActivity(tx, { businessId: user.businessId, type: "request.created", entityType: "Request", entityId: r.id, actorType: "USER", actorUserId: user.id, clientId: client.id });
    return r;
  });
}
