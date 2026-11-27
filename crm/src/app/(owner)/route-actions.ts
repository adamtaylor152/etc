"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { autoOrderRoute, moveStop } from "@/server/ops/routes";

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
