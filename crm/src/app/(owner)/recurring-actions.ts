"use server";
// Recurring jobs (create, schedule, pause, invoice day) and one visit's own price. Each action re-checks the session,
// validates the form, and sends the user back where they came from (with ?error= on a rule violation).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/server/auth";
import type { RecurringBilling } from "@/server/billing/periods";
import { createRecurringJob, setRecurringInvoicing, setRecurringPause, updateRecurrence, type VisitDefaults } from "@/server/ops/jobs";
import { setVisitLines } from "@/server/ops/visits";
import type { Repeat } from "@/server/recurrence";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Check the dates");
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const LINES = z.array(z.object({
  name: z.string().max(200), description: z.string().max(500).optional(), quantity: z.number().positive().max(10_000), unitPriceCents: z.number().int().min(0).max(10_000_000),
}), "Check the prices and quantities").max(40);
/** Repeated line rows from <LineItems>: lineName[], lineDesc[], lineQty[], linePrice[] (dollars). */
const linesFrom = (f: FormData) => {
  const names = f.getAll("lineName").map(String), qtys = f.getAll("lineQty").map(String), prices = f.getAll("linePrice").map(String), descs = f.getAll("lineDesc").map(String);
  return LINES.parse(names.map((name, i) => ({ name: name.trim(), description: descs[i]?.trim() || undefined, quantity: Number(qtys[i] || 1) || 1, unitPriceCents: Math.round(Number(prices[i] || 0) * 100) })).filter((l) => l.name));
};

/** The fields of <RepeatFields>. As needed = no rule. */
function repeatFrom(f: FormData): Repeat | null {
  const freq = z.enum(["WEEKLY", "MONTHLY", "AS_NEEDED"]).parse(str(f, "freq"));
  if (freq === "AS_NEEDED") return null;
  const monthly = freq === "MONTHLY", nth = monthly && str(f, "monthMode") === "NTH", end = str(f, "endMode");
  return {
    freq, interval: int(1, 52).parse(str(f, "interval") || "1"),
    byDay: z.array(int(0, 6)).parse(nth ? [str(f, "nthDay")] : monthly ? [] : f.getAll("byDay").map(String)),
    monthDay: monthly && !nth ? z.union([z.literal(-1), int(1, 28)]).parse(Number(str(f, "monthDay"))) : null,
    nth: nth ? z.union([z.literal(-1), int(1, 4)]).parse(Number(str(f, "nth"))) : null,
    startsOn: day.parse(str(f, "startsOn")), endsOn: end === "ON" ? day.parse(str(f, "endsOn")) : null,
    count: end === "AFTER" ? int(1, 500).parse(str(f, "count")) : null,
  };
}
const defaultsFrom = (f: FormData): VisitDefaults => ({ startTime: str(f, "startTime") || null, endTime: str(f, "endTime") || null, assigneeIds: f.getAll("userId").map(String) });
const invoicingFrom = (f: FormData) => {
  const when = z.enum(["AFTER_EACH_VISIT", "MONTHLY"]).parse(str(f, "invoiceWhen"));
  return { when, invoiceDay: when === "MONTHLY" && str(f, "invoiceDay") ? int(1, 28).parse(str(f, "invoiceDay")) : null };
};

async function run(back: string, fn: () => Promise<unknown>, to?: (out: unknown) => string) {
  let out: unknown;
  try {
    out = await fn();
  } catch (e) {
    if (!(e instanceof TransitionError || e instanceof z.ZodError)) throw e;
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the form and try again" : e.message)}`);
  }
  revalidatePath("/", "layout");
  redirect(to ? to(out) : back);
}
const back = (f: FormData) => { const p = str(f, "back"); return p.startsWith("/") && !p.startsWith("//") ? p : "/"; };

export async function recurringCreate(f: FormData) {
  const user = await requireOwner();
  const from = str(f, "from");
  await run(`/jobs/new?client=${encodeURIComponent(str(f, "clientId"))}&kind=recurring${from ? `&from=${encodeURIComponent(from)}` : ""}`, () => {
    const billing: RecurringBilling = { method: z.enum(["PER_VISIT", "FIXED_PRICE"]).parse(str(f, "billing")), ...invoicingFrom(f) };
    return createRecurringJob(user, {
      clientId: str(f, "clientId"), propertyId: str(f, "propertyId"), title: z.string().min(1, "Give the job a title").max(120).parse(str(f, "title")),
      instructions: str(f, "instructions").slice(0, 2000), lines: linesFrom(f), repeat: repeatFrom(f), defaults: defaultsFrom(f), billing,
      checklistTemplateId: str(f, "checklistTemplateId") === "none" ? null : str(f, "checklistTemplateId") || undefined,
    });
  }, (job) => `/jobs/${(job as { id: string }).id}`);
}

/** The schedule card on the job: the rule plus the time and people every visit gets. */
export async function recurringUpdate(f: FormData) {
  const user = await requireOwner();
  await run(back(f), () => updateRecurrence(user, str(f, "id"), repeatFrom(f), defaultsFrom(f)));
}

/** Pause between two days; resume=1 clears it. */
export async function recurringPause(f: FormData) {
  const user = await requireOwner();
  await run(back(f), () => (str(f, "resume") === "1" ? setRecurringPause(user, str(f, "id"), null, null)
    : setRecurringPause(user, str(f, "id"), day.parse(str(f, "from")), day.parse(str(f, "until")))));
}

export async function recurringInvoicing(f: FormData) {
  const user = await requireOwner();
  await run(back(f), () => { const i = invoicingFrom(f); return setRecurringInvoicing(user, str(f, "id"), i.when, i.invoiceDay); });
}

/** This visit only: its own line items; clear=1 goes back to the job's. */
export async function visitLinesSet(f: FormData) {
  const user = await requireOwner();
  await run(back(f), () => {
    const lines = str(f, "clear") === "1" ? null : linesFrom(f);
    if (lines && !lines.length) throw new TransitionError("Add at least one line item");
    return setVisitLines(user, str(f, "id"), lines);
  });
}
