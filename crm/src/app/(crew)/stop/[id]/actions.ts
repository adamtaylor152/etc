"use server";
// What a crew member can do at a stop beyond the runner's buttons: fill in the checklist and collect the client's
// signature. Only for a visit on their own route (visitScope), and nothing here reads or returns a price.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { saveAnswers, type Answers } from "@/server/ops/checklists";
import { saveSignature } from "@/server/ops/signatures";
import { visitScope } from "@/server/runner";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

async function myVisit(f: FormData) {
  const id = str(f, "visitId");
  const user = await requireUser(`/stop/${id}`);
  const visit = await db.visit.findFirst({ where: { id, businessId: user.businessId, ...visitScope(user) }, include: { job: true } });
  if (!visit) redirect("/run");
  return { user, visit };
}
const fail = (id: string, e: unknown) => {
  if (e instanceof TransitionError) redirect(`/stop/${id}?error=${encodeURIComponent(e.message)}`);
  throw e;
};

/** Saves the whole checklist form (inputs named a_<itemId>), same shape as the owner's visit page. */
export async function stopChecklist(f: FormData) {
  const { user, visit } = await myVisit(f);
  const answers: Answers = {};
  for (const id of f.getAll("itemId").map(String)) {
    const type = str(f, `t_${id}`), v = f.get(`a_${id}`);
    answers[id] = type === "CHECKBOX" ? v === "on" : type === "NUMBER" ? (v === "" || v === null ? null : Number(v)) : v === null ? null : String(v);
  }
  try { await saveAnswers(user, visit.id, answers); } catch (e) { fail(visit.id, e); }
  revalidatePath(`/stop/${visit.id}`);
  redirect(`/stop/${visit.id}?saved=1`);
}

/** The client signs on the crew member's phone. */
export async function stopSign(f: FormData) {
  const { user, visit } = await myVisit(f);
  const h = await headers();
  try {
    await saveSignature({
      businessId: user.businessId, kind: "VISIT", visitId: visit.id, clientId: visit.job.clientId, dataUrl: str(f, "signature"), signerName: str(f, "name"),
      ip: h.get("cf-connecting-ip"), userAgent: h.get("user-agent"), inPerson: true, actorUserId: user.id,
    });
  } catch (e) { fail(visit.id, e); }
  revalidatePath(`/stop/${visit.id}`);
  redirect(`/stop/${visit.id}?saved=1`);
}
