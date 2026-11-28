"use server";
// Card on file, owner side. Owners can remove a client's card and turn their auto-pay OFF. They can never enter a card
// or turn auto-pay on: that choice is the client's alone, made on their own page.
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { removeCard, setAutoPay } from "@/server/ops/autopay";

const ownClient = (businessId: string, f: FormData) => db.client.findFirstOrThrow({ where: { id: String(f.get("clientId") ?? ""), businessId }, select: { id: true } });

export async function clientCardRemove(f: FormData) {
  const user = await requireOwner();
  const client = await ownClient(user.businessId, f);
  await removeCard(client.id, { actorType: "USER", actorUserId: user.id });
  revalidatePath(`/clients/${client.id}`);
}

export async function clientAutoPayOff(f: FormData) {
  const user = await requireOwner();
  const client = await ownClient(user.businessId, f);
  await setAutoPay(client.id, false, { actorType: "USER", actorUserId: user.id });
  revalidatePath(`/clients/${client.id}`);
}
