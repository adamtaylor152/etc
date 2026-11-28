// New job, recurring job or every-snowfall plan for an existing client (/jobs/new?client=...&kind=plan).
// ?from=<job id> ("Create similar job") pre-fills the form from another job.
import { getSettings } from "@/server/settings";
import { requireOwner } from "@/server/auth";
import { WindowChips } from "@/components/window-chips";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Field, Input, PageHeader, Textarea, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { RepeatFields } from "@/components/repeat-fields";
import { RecurringBillingFields } from "@/components/recurring-billing-fields";
import { PlanBillingFields } from "@/components/plan-billing-fields";
import { DepthTierFields } from "@/components/depth-tier-fields";
import { todayLocal } from "@/server/dates";
import { fromRRule } from "@/server/recurrence";
import { planCreate } from "../../work-actions";
import { recurringCreate } from "../../recurring-actions";
import { jobCreateFull } from "../../work2-actions";
import { ClientPick } from "@/components/client-pick";
import { LineItems } from "@/components/line-items";
import { team } from "@/server/schedule";

export const metadata = { title: "New job" };

const hm = (min: number | null | undefined) => (min == null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

export default async function NewJob({ searchParams }: PageProps<"/jobs/new">) {
  await requireOwner();
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const bid = await businessId();
  const request = s("request") ? await db.request.findFirst({ where: { id: s("request"), businessId: bid } }) : null;
  const clientId = request?.clientId ?? s("client");
  // "Create similar job": the same lines, instructions, checklist, billing (and repeat rule) as another job; never its visits.
  const from = s("from") ? await db.job.findFirst({ where: { id: s("from"), businessId: bid, kind: { not: "SNOW_PLAN" } }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } }) : null;
  const kind = s("kind") || (from?.kind === "RECURRING" ? "recurring" : "");
  if (!clientId) {
    const keep = Object.fromEntries(["date", "time", "kind", "from"].filter((k) => s(k)).map((k) => [k, s(k)]));
    return <ClientPick businessId={bid} base="/jobs/new" keep={keep} q={s("q")} title={kind === "plan" ? "New snow plan" : from ? `New job like #${from.number}` : kind === "recurring" ? "New recurring job" : "New job"} />;
  }
  const client = await db.client.findFirst({ where: { id: clientId, businessId: bid }, include: { properties: { where: { archivedAt: null } } } });
  if (!client) notFound();
  const people = await team(bid);
  const checklists = await db.checklistTemplate.findMany({ where: { businessId: bid, active: true }, orderBy: { name: "asc" } });
  const plan = kind === "plan";
  const recurring = kind === "recurring";
  const services = await db.service.findMany({ where: { businessId: bid, active: true }, orderBy: { sortOrder: "asc" } });
  const settings = await getSettings(db, bid), windows = settings.arrivalWindows;
  const rule = from?.rrule ? fromRRule(from.rrule) : null;
  const propertyPick = (
    <Field label="Property">
      {client.properties.length ? (
        <select name="propertyId" className={inputCls} required defaultValue={request?.propertyId ?? from?.propertyId ?? undefined}>{client.properties.map((p) => <option key={p.id} value={p.id}>{p.formatted}</option>)}</select>
      ) : <p className="text-sm text-ink-soft">No property yet. <Link className="font-semibold text-blue" href={`/clients/${client.id}/properties/new`}>Add one first</Link></p>}
    </Field>
  );
  // Shared by the one-off and recurring forms.
  const lineItems = (
    <LineItems services={services.map((sv) => ({ id: sv.id, name: sv.name, description: sv.description, unitPriceCents: sv.unitPriceCents }))}
      label={recurring ? "Line items (each visit, or each month on a fixed price)" : undefined}
      initial={from ? from.lineItems.map((l) => ({ name: l.name, desc: l.description ?? "", qty: String(Number(l.quantity)), price: String(l.unitPriceCents / 100) }))
        : (request?.services ?? []).filter((x) => x !== "Snow shovelling").map((name) => ({ name, price: (() => { const sv = services.find((x) => (x.bookingLabel ?? x.name) === name); return sv?.unitPriceCents != null ? String(sv.unitPriceCents / 100) : ""; })() }))} />
  );
  const assign = people.length > 0 && (
    <div>
      <span className="mb-1 block text-sm font-semibold">Assign</span>
      <div className="flex flex-wrap gap-3">{people.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="userId" value={p.id} defaultChecked={from?.defaultAssigneeIds.includes(p.id)} className="size-4" /><span className="size-2.5 rounded-full" style={{ background: p.color }} />{p.name}</label>)}</div>
    </div>
  );
  const checklistPick = checklists.length > 0 && (
    <Field label="Visit checklist" hint="Automatic = from the services above (if one has a checklist)">
      <select name="checklistTemplateId" className={inputCls} defaultValue={from ? from.checklistTemplateId ?? "none" : ""}><option value="">Automatic</option><option value="none">No checklist</option>{checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    </Field>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={plan ? "New every-snowfall plan" : recurring ? "New recurring job" : "New job"} sub={<>For <Link className="font-semibold text-blue" href={`/clients/${client.id}`}>{clientName(client)}</Link> · <Link className="text-blue" href={from ? `/jobs/new?from=${from.id}` : "/jobs/new"}>change</Link>{from && <> · same as job #{from.number} ({from.title})</>}</>} />
      <nav className="mb-4 flex gap-1 border-b border-line">
        {[["", "One-off"], ["recurring", "Recurring"], ["plan", "Every snowfall"]].map(([k, l]) => (
          <Link key={k} href={`/jobs/new?client=${client.id}${k ? `&kind=${k}` : ""}`} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${(k === "plan" ? plan : k === "recurring" ? recurring : !plan && !recurring) ? "border-blue text-navy" : "border-transparent text-ink-soft"}`}>{l}</Link>
        ))}
      </nav>
      {s("error") && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{s("error")}</p>}
      {plan ? (
        <Card>
          <form action={planCreate} className="space-y-4">
            <input type="hidden" name="clientId" value={client.id} />
            {propertyPick}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Trigger (cm)" hint="Blank = season default"><Input name="triggerCm" type="number" min={0} max={100} /></Field>
              <Field label="Per push ($)"><Input name="price" type="number" step="0.01" defaultValue={30} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold"><input type="checkbox" name="iceMelt" className="size-5" /> Ice melt (+$5)</label>
            </div>
            <DepthTierFields tiers={settings.depthTiers} />
            <PlanBillingFields firstDueOn={todayLocal()} />
            <Button>Create plan</Button>
          </form>
        </Card>
      ) : recurring ? (
        <Card>
          <form action={recurringCreate} className="space-y-5">
            <input type="hidden" name="clientId" value={client.id} />{from && <input type="hidden" name="from" value={from.id} />}
            {propertyPick}
            <Field label="Job title"><Input name="title" required defaultValue={from?.title ?? ""} placeholder="e.g. Bin cleaning" list="service-names" /></Field>
            <datalist id="service-names">{services.map((sv) => <option key={sv.id} value={sv.name} />)}</datalist>
            <Field label="Instructions for the crew"><Textarea name="instructions" rows={2} defaultValue={from?.instructions ?? ""} /></Field>
            <fieldset className="space-y-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-bold">Schedule</legend>
              {/* A copied rule starts again today and keeps going: the old start and end belonged to the other job. */}
              <RepeatFields {...(rule ?? {})} freq={from?.kind === "RECURRING" && from.asNeeded ? "AS_NEEDED" : rule?.freq} startsOn={todayLocal()} endsOn={null} count={null} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start time" hint="Blank = any time"><Input name="startTime" type="time" defaultValue={from && !from.anytime ? hm(from.defaultStartMinute) : ""} /></Field>
                <Field label="End time"><Input name="endTime" type="time" defaultValue={from && !from.anytime && from.defaultStartMinute != null && from.defaultDurationMin ? hm(from.defaultStartMinute + from.defaultDurationMin) : ""} /></Field>
              </div>
              <WindowChips windows={windows} />
              {assign}
            </fieldset>
            {lineItems}
            {checklistPick}
            <RecurringBillingFields {...(from?.kind === "RECURRING" ? { method: from.billingType, when: from.invoiceSchedule, invoiceDay: from.invoiceDay } : {})} />
            <Button>Create recurring job</Button>
          </form>
        </Card>
      ) : (
        <Card>
          <form action={jobCreateFull} className="space-y-5">
            <input type="hidden" name="clientId" value={client.id} />
            {request && <input type="hidden" name="requestId" value={request.id} />}
            {propertyPick}
            <Field label="Job title"><Input name="title" required defaultValue={request?.title ?? from?.title ?? ""} placeholder="e.g. Window cleaning" list="service-names" /></Field>
            <datalist id="service-names">{services.map((sv) => <option key={sv.id} value={sv.name} />)}</datalist>
            <Field label="Instructions for the crew"><Textarea name="instructions" rows={2} defaultValue={request?.notes ?? from?.instructions ?? ""} /></Field>
            <fieldset className="space-y-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-bold">Schedule</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date"><Input name="date" type="date" defaultValue={s("date")} /></Field>
                <Field label="Start time" hint="Blank = any time"><Input name="startTime" type="time" defaultValue={s("time")} /></Field>
                <Field label="End time"><Input name="endTime" type="time" /></Field>
              </div>
              <WindowChips windows={windows} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="later" className="size-4" />Schedule later (goes to the Unscheduled list)</label>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-blue">More visits on other days</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Input key={i} name="moreDate" type="date" aria-label={`Extra visit ${i + 1}`} />)}</div>
              </details>
              {assign}
            </fieldset>
            {lineItems}
            {checklistPick}
            <Field label="Billing">
              <select name="billingType" className={inputCls} defaultValue={from?.kind === "ONE_OFF" ? from.billingType : undefined}><option value="PER_VISIT">Invoice per visit (charges added when each visit is done)</option><option value="FIXED_PRICE">Fixed price for the whole job (invoice when it&apos;s finished)</option></select>
            </Field>
            <Button>Create job</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
