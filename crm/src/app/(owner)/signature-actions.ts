"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { saveSignature } from "@/server/ops/signatures";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** In-person signature on the owner's phone (quote, visit or invoice). */
export async function signInPerson(f: FormData) {
  const user = await requireOwner();
  const kind = str(f, "kind"), id = str(f, "id");
  const h = await headers();
  const target = kind === "quote" ? await db.quote.findFirst({ where: { id, businessId: user.businessId } })
    : kind === "invoice" ? await db.invoice.findFirst({ where: { id, businessId: user.businessId } })
    : await db.visit.findFirst({ where: { id, businessId: user.businessId }, include: { job: true } }).then((v) => v && { clientId: v.job.clientId });
  if (!target) redirect("/");
  const back = kind === "quote" ? `/quotes/${id}` : kind === "invoice" ? `/invoices/${id}` : `/visits/${id}`;
  try {
    await saveSignature({
      businessId: user.businessId, kind: kind === "quote" ? "QUOTE" : kind === "invoice" ? "INVOICE" : "VISIT",
      quoteId: kind === "quote" ? id : undefined, invoiceId: kind === "invoice" ? id : undefined, visitId: kind === "visit" ? id : undefined,
      clientId: target.clientId, dataUrl: str(f, "signature"), signerName: str(f, "name"), ip: h.get("cf-connecting-ip"), userAgent: h.get("user-agent"), inPerson: true, actorUserId: user.id,
    });
  } catch (e) {
    if (e instanceof TransitionError) redirect(`/sign/${kind}/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(back);
  redirect(back);
}

export async function jobRequireSignature(f: FormData) {
  const user = await requireOwner();
  await db.job.updateMany({ where: { id: str(f, "jobId"), businessId: user.businessId }, data: { requireSignature: str(f, "on") === "1" } });
  revalidatePath(`/jobs/${str(f, "jobId")}`);
}
