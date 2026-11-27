"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { applyUnmatched, dismissUnmatched } from "@/server/ops/unmatched";
import { TransitionError } from "@/server/status/visit";

export async function unmatchedApply(f: FormData) {
  const user = await requireOwner();
  const id = String(f.get("id"));
  const allocations = [0, 1, 2].map((i) => ({
    invoiceId: String(f.get(`alloc_${i}_invoice`) ?? ""),
    amountCents: Math.round(Number(f.get(`alloc_${i}_amount`) || 0) * 100),
  }));
  try {
    await applyUnmatched(user, id, allocations);
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/payments/unmatched?error=${encodeURIComponent(e.message)}#u-${id}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/payments/unmatched?applied=1");
}

export async function unmatchedDismiss(f: FormData) {
  const user = await requireOwner();
  await dismissUnmatched(user, String(f.get("id")), String(f.get("reason") ?? "").slice(0, 200));
  revalidatePath("/", "layout");
  redirect("/payments/unmatched");
}
