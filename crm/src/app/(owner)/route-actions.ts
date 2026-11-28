"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { toDbDate } from "@/server/dates";
import { setVisitAssignees } from "@/server/ops/visits";
import { autoOrderRoute, reorderStops } from "@/server/ops/routes";
import { routeEtas, routeVisits } from "@/server/routing";
import { splitRoute } from "@/server/runner";

const back = (f: FormData) => { const p = String(f.get("back") ?? "/routes"); return p.startsWith("/") && !p.startsWith("//") ? p : "/routes"; };

export async function routeAutoOrder(f: FormData) {
  const user = await requireOwner();
  await autoOrderRoute(user, String(f.get("from") ?? "") || null);
  revalidatePath("/", "layout");
  redirect(back(f));
}

/** A drag / arrow reorder inside one community: `scope` "day" = these visits only, "always" = the standing route. */
export async function routeReorder(f: FormData) {
  const user = await requireOwner();
  const ids = String(f.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  await reorderStops(user, ids, f.get("scope") === "always" ? "always" : "day");
  revalidatePath("/", "layout");
  redirect(back(f));
}

/** Split the day's (or storm's) open stops between the ticked people, keeping communities together and evening out the estimated time. */
export async function routeSplit(f: FormData) {
  const user = await requireOwner();
  const people = f.getAll("userId").map(String).filter(Boolean);
  const storm = String(f.get("storm") ?? ""), date = String(f.get("date") ?? "");
  if (people.length && (storm || /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    const { visits } = await routeVisits(user.businessId, { ...(storm ? { snowEventId: storm } : { scheduledDate: toDbDate(date) }), state: { in: ["SCHEDULED", "EN_ROUTE"] } });
    const times = await routeEtas(user.businessId, visits, new Date(), { oneRoute: true });
    const plan = splitRoute(visits.map((v) => ({ id: v.id, community: v.property.communityCode, weight: (times.stops.get(v.id)?.driveMin ?? 0) + (times.stops.get(v.id)?.serviceMin ?? times.serviceMin) })), people);
    for (const [visitId, uid] of plan) await setVisitAssignees(user, visitId, [uid]);
  }
  revalidatePath("/", "layout");
  redirect(back(f));
}
