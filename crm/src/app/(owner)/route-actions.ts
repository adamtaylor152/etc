"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { setVisitAssignees } from "@/server/ops/visits";
import { autoOrderRoute, moveStop } from "@/server/ops/routes";
import { routeVisits } from "@/server/routing";
import { splitRoute } from "@/server/runner";

const back = (f: FormData) => { const p = String(f.get("back") ?? "/routes"); return p.startsWith("/") && !p.startsWith("//") ? p : "/routes"; };

export async function routeAutoOrder(f: FormData) {
  const user = await requireOwner();
  await autoOrderRoute(user);
  revalidatePath("/", "layout");
  redirect(back(f));
}

export async function routeMove(f: FormData) {
  const user = await requireOwner();
  await moveStop(user, String(f.get("propertyId")), f.get("dir") === "up" ? "up" : "down");
  revalidatePath("/", "layout");
  redirect(back(f));
}

/** Split the day's (or storm's) open stops between the ticked people, keeping communities together. */
export async function routeSplit(f: FormData) {
  const user = await requireOwner();
  const people = f.getAll("userId").map(String).filter(Boolean);
  const storm = String(f.get("storm") ?? ""), date = String(f.get("date") ?? "");
  if (people.length && (storm || /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    const { visits } = await routeVisits(user.businessId, { ...(storm ? { snowEventId: storm } : { scheduledDate: toDbDate(date) }), state: { in: ["SCHEDULED", "EN_ROUTE"] } });
    const plan = splitRoute(visits.map((v) => ({ id: v.id, community: v.property.communityCode })), people);
    for (const [visitId, uid] of plan) await setVisitAssignees(user, visitId, [uid]);
  }
  revalidatePath("/", "layout");
  redirect(back(f));
}
