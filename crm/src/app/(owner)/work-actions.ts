"use server";
// Jobs, visits, plans and storms. Each action re-checks the session, validates input, and sends the user
// back where they came from (with ?error= on a rule violation).
import { fromLocalInput } from "@/server/dates";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SkipReason, VisitState } from "@/generated/prisma/client";
import { requireOwner } from "@/server/auth";
import { addVisit, deleteVisit, scheduleVisit, transitionVisit } from "@/server/ops/visits";
import { createRecurringJob, createSnowPlan, renewalCandidates, renewalSeason, setJobClosed, setPlanPaused, updatePlan, updateRecurrence } from "@/server/ops/jobs";
import { db } from "@/server/db";
import { enqueue, kickOutbox } from "@/server/email/outbox";
import { env } from "@/server/env";
import { addPush, cancelStorm, createStorm, finishStorm, setSnowEnded, setStormDepth, startStorm } from "@/server/ops/storms";
import { TransitionError } from "@/server/status/visit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => { const p = str(f, "back"); return p.startsWith("/") && !p.startsWith("//") ? p : "/"; };
const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((s) => s || null);
const cm = z.coerce.number().int().min(0).max(300);
const dollars = z.coerce.number().min(0).max(100_000).transform((d) => Math.round(d * 100));

async function run(f: FormData, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TransitionError || e instanceof z.ZodError) {
      const msg = e instanceof z.ZodError ? "Check the form and try again" : e.message;
      const to = back(f);
      redirect(`${to}${to.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
    }
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(back(f));
}

// ---------- visits ----------
const STATES = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED"] as const;
const REASONS = ["ALREADY_CLEARED", "BLOCKED_BY_CAR", "NO_ACCESS", "BELOW_TRIGGER", "CLIENT_CANCELLED", "WEATHER", "OTHER"] as const;

export async function visitTransition(f: FormData) {
  const user = await requireOwner();
  await run(f, async () => {
    const to = z.enum(STATES).parse(str(f, "to")) as VisitState;
    const num = (k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
    await transitionVisit(user, str(f, "id"), to, {
      skipReason: str(f, "skipReason") ? (z.enum(REASONS).parse(str(f, "skipReason")) as SkipReason) : undefined,
      skipNote: str(f, "skipNote").slice(0, 500),
      depthCm: str(f, "depthCm") ? cm.parse(str(f, "depthCm")) : undefined,
      iceMeltApplied: f.has("iceMeltShown") ? f.get("iceMeltApplied") === "on" : undefined,
      lat: num("lat"), lng: num("lng"),
    });
  });
}

export async function visitSchedule(f: FormData) {
  const user = await requireOwner();
  await run(f, () => scheduleVisit(user, str(f, "id"), date.parse(str(f, "date"))));
}

export async function visitAdd(f: FormData) {
  const user = await requireOwner();
  await run(f, () => addVisit(user, str(f, "jobId"), date.parse(str(f, "date"))));
}

export async function visitDelete(f: FormData) {
  const user = await requireOwner();
  await run(f, () => deleteVisit(user, str(f, "id")));
}

// ---------- jobs & plans ----------

export async function planCreate(f: FormData) {
  const user = await requireOwner();
  const job = await createSnowPlan(user, {
    clientId: str(f, "clientId"), propertyId: str(f, "propertyId"),
    triggerCm: str(f, "triggerCm") ? cm.parse(str(f, "triggerCm")) : null,
    pricePerPushCents: dollars.parse(str(f, "price") || "30"), iceMelt: f.get("iceMelt") === "on",
  });
  revalidatePath("/", "layout");
  redirect(`/jobs/${job.id}`);
}

export async function planUpdate(f: FormData) {
  const user = await requireOwner();
  await run(f, () => updatePlan(user, str(f, "id"), {
    triggerCm: str(f, "triggerCm") ? cm.parse(str(f, "triggerCm")) : null,
    pricePerPushCents: dollars.parse(str(f, "price")), iceMelt: f.get("iceMelt") === "on", extraWalk: f.get("extraWalk") === "on",
  }));
}

export async function planPause(f: FormData) {
  const user = await requireOwner();
  await run(f, () => setPlanPaused(user, str(f, "id"), str(f, "paused") === "1"));
}

export async function jobClose(f: FormData) {
  const user = await requireOwner();
  await run(f, () => setJobClosed(user, str(f, "id"), str(f, "closed") === "1", str(f, "reason").slice(0, 300)));
}

// ---------- storms ----------
export async function stormCreate(f: FormData) {
  const user = await requireOwner();
  const forecast = str(f, "forecastCm");
  const ev = await createStorm(user, { forecastCm: forecast ? cm.parse(forecast) : null, notes: str(f, "notes").slice(0, 1000) });
  if (f.get("start") === "1") await startStorm(user, ev.id, forecast ? cm.parse(forecast) : 0);
  revalidatePath("/", "layout");
  redirect(`/snow/${ev.id}`);
}

export async function stormStart(f: FormData) {
  const user = await requireOwner();
  await run(f, () => startStorm(user, str(f, "id"), cm.parse(str(f, "cm"))));
}

export async function stormDepth(f: FormData) {
  const user = await requireOwner();
  await run(f, () => setStormDepth(user, str(f, "id"), cm.parse(str(f, "cm"))));
}

export async function stormPush(f: FormData) {
  const user = await requireOwner();
  await run(f, () => addPush(user, str(f, "id")));
}

export async function stormFinish(f: FormData) {
  const user = await requireOwner();
  await run(f, () => finishStorm(user, str(f, "id")));
}

export async function stormSnowEnded(f: FormData) {
  const user = await requireOwner();
  const at = str(f, "at");
  await run(f, () => setSnowEnded(user, str(f, "id"), f.get("clear") ? null : at ? fromLocalInput(at) : new Date()));
}

export async function stormCancel(f: FormData) {
  const user = await requireOwner();
  await run(f, () => cancelStorm(user, str(f, "id")));
}

/** Calendar drag & drop (called directly from the client component). */
export async function calendarReschedule(visitId: string, date: string | null) {
  const user = await requireOwner();
  const d = date === null ? null : z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  await scheduleVisit(user, visitId, d);
  revalidatePath("/schedule");
}

// ---------- recurring ----------
const REPEAT = z.object({ freq: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]), byDay: z.array(z.coerce.number().int().min(0).max(6)), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: date });
const repeatFrom = (f: FormData) => str(f, "freq") === "AS_NEEDED" ? null
  : REPEAT.parse({ freq: str(f, "freq"), byDay: f.getAll("byDay").map(String), startsOn: str(f, "startsOn"), endsOn: str(f, "endsOn") });

export async function recurringCreate(f: FormData) {
  const user = await requireOwner();
  const names = f.getAll("lineName").map(String), prices = f.getAll("linePrice").map(String), qtys = f.getAll("lineQty").map(String);
  const lines = names.map((name, i) => ({ name: name.trim(), unitPriceCents: dollars.parse(prices[i] || "0"), quantity: z.coerce.number().positive().max(1000).parse(qtys[i] || "1") })).filter((l) => l.name);
  const job = await createRecurringJob(user, {
    clientId: str(f, "clientId"), propertyId: str(f, "propertyId"), title: z.string().min(1).max(120).parse(str(f, "title")),
    instructions: str(f, "instructions").slice(0, 2000), lines, repeat: repeatFrom(f),
  });
  revalidatePath("/", "layout");
  redirect(`/jobs/${job.id}`);
}

export async function recurringUpdate(f: FormData) {
  const user = await requireOwner();
  await run(f, () => updateRecurrence(user, str(f, "id"), repeatFrom(f)));
}

export async function sendRenewals() {
  const user = await requireOwner();
  const season = await renewalSeason(user.businessId);
  if (!season) redirect("/snow?error=" + encodeURIComponent("Set up next season in Settings first"));
  const ids = await renewalCandidates(user.businessId, season.id);
  const clients = await db.client.findMany({ where: { id: { in: ids }, marketingOptOut: false, emailBouncedAt: null, archivedAt: null } });
  for (const c of clients) {
    await enqueue(db, {
      businessId: user.businessId, template: "plan.renewal", to: c.email, replyTo: env.helpEmail, priority: 7, props: { clientId: c.id, seasonId: season.id },
      dedupeKey: `renewal:${season.id}:${c.id}`, clientId: c.id,
    });
  }
  kickOutbox();
  redirect(`/snow?renewals=${clients.length}`);
}
