import { requireOwner } from "@/server/auth";
import { jobRequireSignature } from "../../signature-actions";
import { jobChecklistSet } from "../../checklist-actions";
import { JobCosting } from "@/components/job-costing";
import { team } from "@/server/schedule";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/flash";
import { Gallery } from "@/components/gallery";
import { PhotoUploader } from "@/components/photo-uploader";
import { JobBadge, VisitBadge } from "@/components/status";
import { RecordPanel } from "@/components/record-panel";
import { Badge, Button, ButtonLink, Card, Dl, Empty, Field, Input, btn, inputCls } from "@/components/ui";
import { DetailHeader } from "@/components/detail-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Copy, Lock, Pencil, Trash2 } from "lucide-react";
import { dateOnly, prettyDate, todayLocal } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { money } from "@/server/money";
import { clientName, jobsWithStatus } from "@/server/queries";
import { visitStatus } from "@/server/status/job";
import { invoiceCreate } from "../../billing-actions";
import { RepeatFields } from "@/components/repeat-fields";
import { PLAN_MODE, PlanBillingFields } from "@/components/plan-billing-fields";
import { instalmentKey, instalmentSchedule, planBillingLocked } from "@/server/billing/instalments";
import { describeRule, fromRRule } from "@/server/recurrence";
import { currentCharge } from "@/server/ops/drive-size";
import { jobClose, planPause, planUpdate, visitAdd, visitDelete, visitSchedule, visitTransition } from "../../work-actions";
import { recurringInvoicing, recurringPause, recurringUpdate } from "../../recurring-actions";
import { RecurringBillingFields } from "@/components/recurring-billing-fields";
import { WindowChips } from "@/components/window-chips";
import { getSettings } from "@/server/settings";
import { DepthTierFields } from "@/components/depth-tier-fields";
import { describeTiers, parseTiers } from "@/server/snow/tiers";

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const SKIP: [string, string][] = [["CLIENT_CANCELLED", "Client asked to skip"], ["WEATHER", "Weather"], ["NO_ACCESS", "Can't get in"], ["OTHER", "Other"]];

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const bid = await businessId();
  const [row] = await jobsWithStatus({ id, businessId: bid });
  if (!row) notFound();
  const job = await db.job.findUniqueOrThrow({
    where: { id },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } }, season: true, request: true, property: { include: { community: true } },
      visits: { orderBy: [{ scheduledDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], include: { charges: true, snowEvent: true, extras: true } },
      invoices: { orderBy: { number: "desc" } },
    },
  });
  const [photos] = await Promise.all([
    // Photos the client sent with their request show up on the job too.
    db.attachment.findMany({
      where: { businessId: bid, deletedAt: null, OR: [{ jobId: id }, ...(job.requestId ? [{ requestId: job.requestId }] : [])] },
      orderBy: { createdAt: "desc" }, take: 60,
    }),
  ]);
  const today = todayLocal();
  const checklists = await db.checklistTemplate.findMany({ where: { businessId: bid, active: true }, orderBy: { name: "asc" } });
  const here = `/jobs/${id}`;
  const plan = job.kind === "SNOW_PLAN";
  const people = await team(bid);
  const rule = job.rrule ? fromRRule(job.rrule) : null;
  const fixedMonthly = job.kind === "RECURRING" && job.billingType === "FIXED_PRICE";
  const closed = !!job.closedAt;
  const charges = job.visits.flatMap((v) => v.charges.map((c) => ({ ...c, date: dateOnly(v.scheduledDate) })));
  const unbilled = charges.filter((c) => !c.invoiceLineItemId);
  // Snow plan billing: same lock rule as updatePlan; seasonal plans show their instalment schedule against the invoices made so far.
  const mode = job.snowBillingMode ?? "PER_PUSH";
  const tiers = parseTiers(job.depthTiers);
  const instalmentInvoices = job.invoices.filter((i) => i.instalmentKey);
  const billingLocked = planBillingLocked({ visitCharges: charges.length, instalmentInvoices: instalmentInvoices.length });
  const instalments = plan && mode === "SEASONAL" && job.seasonalPriceCents && job.seasonalInstalments && job.seasonalFirstDueOn
    ? instalmentSchedule(job.seasonalPriceCents, job.seasonalInstalments, dateOnly(job.seasonalFirstDueOn)!).map((i) => ({ ...i, invoice: instalmentInvoices.find((x) => x.instalmentKey === instalmentKey(job.id, i.n)) }))
    : [];
  const paidCents = instalmentInvoices.filter((i) => i.status !== "VOID").reduce((a, i) => a + i.amountPaidCents, 0);

  const KIND = job.kind === "SNOW_PLAN" ? "Every-snowfall plan" : job.kind === "RECURRING" ? "Recurring job" : "One-off job";
  const unbilledCents = unbilled.reduce((a, c) => a + c.totalCents, 0);
  const canInvoice = unbilled.length > 0 || (job.billingType === "FIXED_PRICE" && !fixedMonthly && !job.invoices.some((i) => i.status !== "VOID"));
  const small = "min-h-9! px-3!";
  const check = "flex min-h-10 items-center gap-2 text-sm font-semibold";

  return (
    <>
      <Flash error={sp.error} />
      <DetailHeader
        back={{ href: "/jobs", label: "Jobs" }}
        kind={<span className="tabular-nums">{KIND} #{job.number}</span>}
        status={<JobBadge s={row.status} />}
        title={job.title}
        sub={<><Link className="font-semibold text-blue hover:text-blue-deep" href={`/clients/${job.clientId}`}>{clientName(row.client)}</Link> · {job.property.formatted}{job.property.community && ` · ${job.property.community.name}`}</>}
        actions={<>
          {canInvoice && (
            <form action={invoiceCreate}>
              <input type="hidden" name="clientId" value={job.clientId} /><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="back" value={here} />
              {job.billingType === "FIXED_PRICE" && !fixedMonthly && <input type="hidden" name="fixed" value="1" />}
              <Button>Create invoice</Button>
            </form>
          )}
          <ButtonLink href={`${here}/edit`}><Pencil className="size-4" aria-hidden />Edit</ButtonLink>
          {!plan && <ButtonLink href={`/jobs/new?client=${job.clientId}&from=${job.id}`}><Copy className="size-4" aria-hidden />Create similar job</ButtonLink>}
          <form action={jobClose}>
            <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
            <input type="hidden" name="closed" value={closed ? "0" : "1"} />
            <Button variant="secondary">{closed ? "Reopen job" : plan ? "End plan" : "Close job"}</Button>
          </form>
        </>}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Left: the work, and what it has earned. */}
        <div className="min-w-0 space-y-5">
          <Card title="Visits" actions={!closed && (
            <form action={visitAdd} className="flex items-center gap-2">
              <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="back" value={here} />
              <Input type="date" name="date" className="w-36! sm:w-40!" aria-label="Date for the new visit (blank = unscheduled)" title="Blank = unscheduled" />
              <Button variant="secondary">Add visit</Button>
            </form>
          )}>
            {job.visits.length ? (
              <ul className="-my-1 divide-y divide-line-soft">
                {job.visits.map((v) => {
                  const s = visitStatus({ state: v.state, scheduledDate: dateOnly(v.scheduledDate) }, today);
                  const open = v.state === "SCHEDULED";
                  const facts = [
                    v.snowEvent && `${v.snowEvent.name}${v.pushNumber ? `, push ${v.pushNumber}` : ""}${v.isReturn ? ", return visit" : ""}`,
                    v.lineOverrides != null && "own price",
                    v.state === "SKIPPED" && v.skipNote,
                    v.extras.length > 0 && `+ ${v.extras.map((e) => e.name).join(", ")}`,
                  ].filter(Boolean);
                  return (
                    <li key={v.id} className="py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/visits/${v.id}`} className="group min-w-0 rounded-md">
                          <span className="font-semibold tabular-nums group-hover:text-blue-deep">{v.scheduledDate ? prettyDate(dateOnly(v.scheduledDate)) : "Not scheduled"}</span>
                          {facts.length > 0 && <span className="block text-ink-soft">{facts.join(" · ")}</span>}
                        </Link>
                        <span className="flex shrink-0 items-center gap-1">
                          <VisitBadge s={s} />
                          {open && (
                            <form action={visitDelete}>
                              <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                              <ConfirmButton message="Delete this visit? It comes off the schedule for good." className="-my-1.5 inline-flex size-9 items-center justify-center rounded-lg text-ink-soft hover:bg-red-50 hover:text-red-700" aria-label="Delete visit" title="Delete visit"><Trash2 className="size-4" aria-hidden /></ConfirmButton>
                            </form>
                          )}
                        </span>
                      </div>
                      {open && (!v.snowEventId || !plan) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {!v.snowEventId && (
                            <form action={visitSchedule} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value={here} />
                              <input type="date" name="date" defaultValue={dateOnly(v.scheduledDate) ?? ""} className={`${inputCls} min-h-9! w-36! py-1!`} aria-label="Move this visit to" />
                              <button className={btn("secondary", small)}>Move</button>
                            </form>
                          )}
                          {!plan && (
                            <details className="relative">
                              <summary className={`list-none ${btn("secondary", small)}`}>Skip</summary>
                              <form action={visitTransition} className="absolute left-0 z-10 mt-1 w-64 space-y-2 rounded-xl border border-line bg-white p-3 shadow-lift">
                                <input type="hidden" name="id" value={v.id} /><input type="hidden" name="to" value="SKIPPED" /><input type="hidden" name="back" value={here} />
                                <select name="skipReason" className={inputCls} aria-label="Reason">{SKIP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                                <input name="skipNote" placeholder="Note (optional)" aria-label="Note (optional)" maxLength={500} className={inputCls} />
                                <button className={btn("secondary", "w-full")}>Skip this visit</button>
                              </form>
                            </details>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : <Empty>{plan ? "Visits appear here when a storm starts." : closed ? "No visits on this job." : "No visits yet. Pick a date above and add the first one."}</Empty>}
          </Card>

          {plan ? (
            <Card title={<>Plan pricing and billing{job.planPausedAt && <span className="ml-2 align-middle"><Badge tone="amber">Paused</Badge></span>}</>} actions={!closed && (
              <form action={planPause}>
                <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                <input type="hidden" name="paused" value={job.planPausedAt ? "0" : "1"} />
                <Button variant="secondary">{job.planPausedAt ? "Resume" : "Pause (away)"}</Button>
              </form>
            )}>
              <p className="mb-4 max-w-[70ch] text-sm text-ink-soft">{job.season?.name}. A visit is added automatically when a storm reaches the trigger. {mode === "SEASONAL"
                ? <>Billed a flat <span className="font-semibold tabular-nums text-navy">{money(job.seasonalPriceCents ?? 0)}</span> for the season{job.addonsIncluded ? ", ice melt included" : "; ice melt is charged per visit"}.</>
                : mode === "PER_EVENT" ? "Billed once per storm, however many pushes; invoiced when the storm is finished." : "Billed per push, once per storm."}
                {mode !== "SEASONAL" && tiers.length > 0 && <> By depth: <span className="font-semibold text-navy">{describeTiers(tiers, job.pricePerPushCents ?? 3000, money)}</span>.</>}</p>
              <form action={planUpdate} className="space-y-4">
                <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                <div className="grid items-start gap-3 sm:grid-cols-3">
                  <Field label="Trigger (cm)"><Input name="triggerCm" type="number" min={0} max={100} defaultValue={job.triggerCm ?? ""} placeholder={`${job.season?.defaultTriggerCm ?? 2} (season)`} /></Field>
                  <Field label="Per push / storm ($)"><Input name="price" type="number" step="0.01" min={0} defaultValue={(job.pricePerPushCents ?? 3000) / 100} /></Field>
                  <div className="sm:pt-6">
                    <label className={check}><input type="checkbox" name="iceMelt" defaultChecked={job.iceMelt} className="size-5" /> Ice melt</label>
                    <label className={check}><input type="checkbox" name="extraWalk" defaultChecked={currentCharge(job.lineItems).walk > 0} className="size-5" /> Extra sidewalk</label>
                  </div>
                </div>
                <DepthTierFields tiers={tiers} />
                {/* No billing fields once locked: the action then leaves the billing mode alone. */}
                {billingLocked
                  ? <p className="flex gap-2 rounded-lg bg-tint px-3 py-2.5 text-sm text-ink-soft"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Billing: <span className="font-semibold text-navy">{PLAN_MODE[mode]}</span>. The billing mode can&apos;t change now that this plan has charges or instalment invoices: end it and start a new plan instead.</span></p>
                  : <PlanBillingFields mode={mode} seasonPriceCents={job.seasonalPriceCents} instalments={job.seasonalInstalments} firstDueOn={dateOnly(job.seasonalFirstDueOn) ?? today} addonsIncluded={mode === "SEASONAL" ? job.addonsIncluded : undefined} />}
                <Button variant="secondary">Save plan</Button>
              </form>
              {mode === "SEASONAL" && (
                <div className="mt-5 border-t border-line-soft pt-4 text-sm">
                  <h3 className="font-semibold">Instalments</h3>
                  <p className="mt-0.5 tabular-nums text-ink-soft">{money(paidCents)} of {money(job.seasonalPriceCents ?? 0)} paid · {instalments.filter((i) => i.invoice?.status === "PAID").length} of {instalments.length} instalment{instalments.length === 1 ? "" : "s"} paid</p>
                  <ul className="mt-2 divide-y divide-line-soft">
                    {instalments.map((i) => (
                      <li key={i.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 tabular-nums">
                        <span>{prettyDate(i.dueOn)} · <span className="font-semibold">{money(i.amountCents)}</span></span>
                        {i.invoice ? <Link href={`/invoices/${i.invoice.id}`} className="font-semibold text-blue hover:text-blue-deep">Invoice #{i.invoice.number} · {i.invoice.status === "PAID" ? "Paid" : i.invoice.status === "VOID" ? "Void" : "Unpaid"}</Link>
                          : <span className="text-ink-soft">{closed ? "Not invoiced (plan ended)" : i.dueOn <= today ? "Invoicing within the hour" : "Not due yet"}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ) : (
            <Card title="Line items">
              {job.lineItems.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs font-medium text-ink-soft"><th scope="col" className="pb-2 text-left font-medium">Item</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Qty</th><th scope="col" className="pb-2 pl-3 text-right font-medium">Unit price</th></tr></thead>
                    <tbody className="divide-y divide-line-soft border-t border-line-soft">
                      {job.lineItems.map((l) => (
                        <tr key={l.id}><td className="py-2.5">{l.name}{!l.perVisit && <span className="ml-1 text-xs text-ink-soft">(once)</span>}{l.description && <span className="block text-xs text-ink-soft">{l.description}</span>}</td><td className="py-2.5 pl-3 text-right align-top text-ink-soft">{String(l.quantity)}</td><td className="py-2.5 pl-3 text-right align-top font-semibold">{money(l.unitPriceCents)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty action={<ButtonLink href={`${here}/edit`}>Add line items</ButtonLink>}>No line items on this job yet.</Empty>}
              <p className="mt-3 max-w-[70ch] text-xs text-ink-soft">{fixedMonthly ? `Fixed price ${money(job.totalCents ?? 0)} a month however many visits, drafted on day ${job.invoiceDay ?? 1}. Visits add no charges.`
                : job.billingType === "FIXED_PRICE" ? `Fixed price ${money(job.totalCents ?? 0)}, invoiced when the job is done.`
                : job.invoiceSchedule === "MONTHLY" ? `Billed for the visits done, drafted monthly on day ${job.invoiceDay ?? 1}.` : "Billed per visit."} Prices include tax.</p>
              {job.kind === "RECURRING" && !closed && (
                <form action={recurringInvoicing} className="mt-4 space-y-3 border-t border-line-soft pt-4">
                  <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                  <RecurringBillingFields lockMethod method={job.billingType} when={job.invoiceSchedule} invoiceDay={job.invoiceDay} />
                  <Button variant="secondary">Save invoice schedule</Button>
                </form>
              )}
            </Card>
          )}

          <Card title="Charges and invoices" actions={unbilled.length > 0 && <Badge tone="amber"><span className="tabular-nums">{money(unbilledCents)}</span> not invoiced</Badge>}>
            {job.invoices.length > 0 && (
              <>
                <h3 className="text-xs font-medium text-ink-soft">Invoices</h3>
                <ul className="mb-4 mt-1 divide-y divide-line-soft">
                  {job.invoices.map((i) => (
                    <li key={i.id}><Link href={`/invoices/${i.id}`} className="group -mx-2 flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-tint"><span className="font-semibold tabular-nums group-hover:text-blue-deep">Invoice #{i.number}</span><span className="tabular-nums"><span className="font-semibold">{money(i.totalCents)}</span> <span className="text-ink-soft">· {i.status === "PAID" ? "Paid" : i.status === "DRAFT" ? "Draft" : i.status === "VOID" ? "Void" : "Unpaid"}</span></span></Link></li>
                  ))}
                </ul>
              </>
            )}
            {charges.length ? (
              <>
                {job.invoices.length > 0 && <h3 className="mb-1 text-xs font-medium text-ink-soft">Charges</h3>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-line-soft">
                      {charges.map((c) => (
                        <tr key={c.id}><td className="whitespace-nowrap py-2 pr-3 text-ink-soft">{prettyDate(c.date)}</td><td className="py-2">{c.name}</td><td className="py-2 pl-3 text-right font-semibold">{money(c.totalCents)}</td><td className={`whitespace-nowrap py-2 pl-3 text-right text-xs ${c.invoiceLineItemId ? "text-ink-soft" : "font-semibold text-amber-800"}`}>{c.invoiceLineItemId ? "Invoiced" : "Not invoiced"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <Empty>{fixedMonthly ? "A draft invoice for the monthly price is made on the invoice day. Visits add no charges." : "Charges are added when a visit is marked done."}</Empty>}
          </Card>

          <Card title="Photos">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <PhotoUploader endpoint="/api/uploads" fields={{ jobId: job.id, kind: "BEFORE" }} label="Before" camera={false} />
              <PhotoUploader endpoint="/api/uploads" fields={{ jobId: job.id, kind: "AFTER" }} label="After" camera={false} />
              <PhotoUploader endpoint="/api/uploads" fields={{ jobId: job.id, kind: "OTHER" }} label="Other" camera={false} />
            </div>
            {photos.length ? <Gallery photos={photos} back={here} /> : <p className="max-w-[70ch] text-sm text-ink-soft">Add as many before and after photos as you like, here or on each visit. Photos the client sent with their request show here too.</p>}
          </Card>

          <JobCosting businessId={bid} jobId={job.id} people={people} back={here} />
        </div>

        {/* Right: how the job is set up, then notes and history. */}
        <div className="min-w-0 space-y-5">
          {job.kind === "RECURRING" && (
            <Card title="Repeats">
              <p className="mb-3 text-sm"><span className="font-semibold">{describeRule(job.rrule)}</span>{job.pausedFrom && job.pausedUntil && dateOnly(job.pausedUntil)! >= today && <span className="ml-2 align-middle"><Badge tone="amber">Paused {prettyDate(dateOnly(job.pausedFrom))} to {prettyDate(dateOnly(job.pausedUntil))}</Badge></span>}</p>
              <form action={recurringUpdate} className="space-y-3 [&_input[type=date]]:min-w-36">
                <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                <RepeatFields {...(rule ?? {})} freq={job.asNeeded ? "AS_NEEDED" : rule?.freq} startsOn={rule?.startsOn || (dateOnly(job.recurrenceStartsOn) ?? today)} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start time" hint="Blank = any time"><Input name="startTime" type="time" defaultValue={!job.anytime && job.defaultStartMinute != null ? hm(job.defaultStartMinute) : ""} /></Field>
                  <Field label="End time"><Input name="endTime" type="time" defaultValue={!job.anytime && job.defaultStartMinute != null && job.defaultDurationMin ? hm(job.defaultStartMinute + job.defaultDurationMin) : ""} /></Field>
                </div>
                <WindowChips windows={(await getSettings(db, bid)).arrivalWindows} />
                {people.length > 0 && (
                  <fieldset>
                    <legend className="text-sm font-semibold">Assign</legend>
                    <div className="flex flex-wrap items-center gap-x-4">
                      {people.map((p) => <label key={p.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="userId" value={p.id} defaultChecked={job.defaultAssigneeIds.includes(p.id)} className="size-5" /><span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</label>)}
                    </div>
                  </fieldset>
                )}
                <Button variant="secondary">Update schedule</Button>
                <p className="text-xs text-ink-soft">Future visits nobody has touched are rebuilt with this time and these people. Done, moved or re-priced visits stay as they are.</p>
              </form>
              {!closed && !job.asNeeded && (
                <form action={recurringPause} className="mt-4 border-t border-line-soft pt-4">
                  <input type="hidden" name="id" value={job.id} /><input type="hidden" name="back" value={here} />
                  <h3 className="mb-2 text-sm font-semibold">Pause for a while</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From"><Input type="date" name="from" defaultValue={dateOnly(job.pausedFrom) ?? ""} required /></Field>
                    <Field label="To"><Input type="date" name="until" defaultValue={dateOnly(job.pausedUntil) ?? ""} required /></Field>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary">{job.pausedFrom ? "Change pause" : "Pause"}</Button>
                    {job.pausedFrom && <Button variant="secondary" name="resume" value="1" formNoValidate>Resume</Button>}
                  </div>
                  <p className="mt-2 text-xs text-ink-soft">No visits are created between these days (both included). Visits already done, moved or re-priced stay.{fixedMonthly && " A month that is paused from its first day to its last is not invoiced."}</p>
                </form>
              )}
            </Card>
          )}

          <Card title="On each visit">
            <form action={jobChecklistSet}>
              <input type="hidden" name="jobId" value={job.id} />
              <label htmlFor="job-checklist" className="mb-1 block text-sm font-semibold">Visit checklist</label>
              <div className="flex gap-2">
                <select id="job-checklist" name="templateId" defaultValue={job.checklistTemplateId ?? ""} className={inputCls}><option value="">None</option>{checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <Button variant="secondary">Save</Button>
              </div>
              <Link href="/settings/checklists" className="mt-1.5 inline-block text-xs font-semibold text-blue hover:text-blue-deep">Edit checklists</Link>
            </form>
            <form action={jobRequireSignature} className="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
              <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="on" value={job.requireSignature ? "0" : "1"} />
              <p className="min-w-0 text-sm"><span className="block font-semibold">Client signature</span><span className="text-ink-soft">{job.requireSignature ? "Required before each visit is marked Done" : "Not required"}</span></p>
              <Button variant="secondary">{job.requireSignature ? "Turn off" : "Require"}</Button>
            </form>
          </Card>

          <Card title="Details">
            <Dl rows={[
              ["Community", job.property.community?.name ?? "Unknown (no map pin)"],
              ["Instructions", job.instructions],
              ["From request", job.request ? <Link className="font-semibold text-blue hover:text-blue-deep" href={`/requests/${job.request.id}`}>#{job.request.number}</Link> : null],
              ["Closed", job.closedAt ? `${prettyDate(job.closedAt.toISOString().slice(0, 10))}${job.closeReason ? ` (${job.closeReason})` : ""}` : null],
            ]} />
          </Card>

          <RecordPanel businessId={bid} target={{ jobId: job.id }} clientId={job.clientId} path={here} />
        </div>
      </div>
    </>
  );
}
