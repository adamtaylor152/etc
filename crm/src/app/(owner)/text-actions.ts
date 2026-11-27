"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { clientByPhone, clientFromThread, linkTextPhotos, linkThread } from "@/server/ops/texts";
import { toE164 } from "@/server/sms";
import { TransitionError } from "@/server/status/visit";

const back = (key: string) => `/messages/${encodeURIComponent(key)}`;
async function attempt(key: string, fn: () => Promise<string | void>) {
  let to = back(key);
  try {
    const next = await fn();
    if (next) to = next;
  } catch (e) {
    if (e instanceof TransitionError) redirect(`${to}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/messages", "layout");
  redirect(to);
}

/** Link an unknown number's thread to an existing client. */
export async function textLinkClient(f: FormData) {
  const user = await requireOwner();
  const key = String(f.get("key") ?? "");
  await attempt(key, async () => back(await linkThread(user, `+${key.slice(1)}`, String(f.get("clientId") ?? ""))));
}

/** Make a new client from an unknown number's thread. */
export async function textNewClient(f: FormData) {
  const user = await requireOwner();
  const key = String(f.get("key") ?? "");
  await attempt(key, async () => back(await clientFromThread(user, `+${key.slice(1)}`, {
    firstName: String(f.get("firstName") ?? ""), lastName: String(f.get("lastName") ?? ""), email: String(f.get("email") ?? ""),
  })));
}

/** Put a text's photos on a job or quote. */
export async function textPhotosLink(f: FormData) {
  const user = await requireOwner();
  const key = String(f.get("key") ?? "");
  await attempt(key, () => linkTextPhotos(user, { messageId: String(f.get("messageId") ?? ""), attachmentIds: f.getAll("photo").map(String), target: String(f.get("target") ?? "") }));
}

/** New conversation: pick a client or type a number, then land in that thread. */
export async function textStart(f: FormData) {
  const user = await requireOwner();
  const clientId = String(f.get("clientId") ?? "");
  if (clientId) {
    const c = await db.client.findFirst({ where: { id: clientId, businessId: user.businessId } });
    if (c) redirect(back(c.id));
  }
  const n = toE164(String(f.get("number") ?? ""));
  if (!n) redirect("/messages/new?error=" + encodeURIComponent("Pick a client or type a 10-digit number"));
  const c = await clientByPhone(user.businessId, n);
  redirect(back(c?.id ?? `n${n.slice(1)}`));
}
