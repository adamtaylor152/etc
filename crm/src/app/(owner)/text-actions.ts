"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { sendText } from "@/server/ops/texts";
import { TransitionError } from "@/server/status/visit";

export async function textSend(f: FormData) {
  const user = await requireOwner();
  const key = String(f.get("key") ?? "");
  const back = `/messages/${encodeURIComponent(key)}`;
  try {
    await sendText(user, key.startsWith("n") ? { to: `+${key.slice(1)}`, body: String(f.get("body") ?? "") } : { clientId: key, body: String(f.get("body") ?? "") });
  } catch (e) {
    if (e instanceof TransitionError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/messages");
  redirect(back);
}
