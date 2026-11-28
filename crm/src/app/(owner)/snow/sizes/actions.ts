"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { confirmSize } from "@/server/ops/drive-size";

export async function sizeConfirm(f: FormData) {
  const user = await requireOwner();
  const size = String(f.get("size"));
  if (size !== "STANDARD" && size !== "LARGE" && size !== "OVERSIZED") redirect("/snow/sizes");
  const res = await confirmSize(user, String(f.get("propertyId")), size, f.get("extraWalk") === "on");
  revalidatePath("/", "layout");
  const said = res.includes("asked") ? "New price sent to the client to OK." : res.includes("quote") ? "Held until you send a quote." : "Size saved.";
  redirect(`/snow/sizes?done=${encodeURIComponent(said)}`);
}
