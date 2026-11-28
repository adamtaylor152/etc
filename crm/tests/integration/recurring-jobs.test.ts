// Against a real database: recurring jobs hand their time and people to every generated visit (and keep them when the
// schedule changes), pause and skip, bill a fixed monthly price exactly once per month, and let one visit carry its own price.
import { describe, expect, it } from "vitest";
import { addDays, dateOnly, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { invoiceRecurringPeriods, invoiceUnbilled } from "@/server/ops/invoices";
import { createRecurringJob, setJobClosed, setRecurringInvoicing, setRecurringPause, updateRecurrence } from "@/server/ops/jobs";
import { setVisitLines, transitionVisit } from "@/server/ops/visits";

async function setup(tag: string) {
  const bid = await businessId();
  const owner = await db.user.findFirstOrThrow({ where: { businessId: bid, role: "OWNER", active: true } });
  const t = `${tag}${Date.now().toString(36)}`;
  const client = await db.client.create({ data: { businessId: bid, firstName: "Recur", lastName: t, email: `recur-${t}@example.com`, source: "MANUAL" } });
  const formatted = `${t} Repeat Rd SW, Calgary`;
  const property = await db.property.create({ data: { businessId: bid, clientId: client.id, formatted, normalized: formatted.toLowerCase() } });
  return { owner, ids: { clientId: client.id, propertyId: property.id }, today: todayLocal() };
}
const lines = [{ name: "Bin cleaning", quantity: 1, unitPriceCents: 2500 }, { name: "Deodorize", quantity: 2, unitPriceCents: 500 }];
const visitsOf = (jobId: string) => db.visit.findMany({ where: { jobId }, orderBy: { scheduledDate: "asc" }, include: { assignees: true } });

describe("recurring jobs", () => {
  it("visits inherit time and people, survive a schedule change, and can be skipped or paused", async () => {
    const { owner, ids, today } = await setup("a");
    const job = await createRecurringJob(owner, {
      ...ids, title: "Bins", lines, checklistTemplateId: null, repeat: { freq: "WEEKLY", interval: 1, byDay: [], startsOn: today, endsOn: null },
      defaults: { startTime: "08:00", endTime: "10:30", assigneeIds: [owner.id, "not-a-user"] }, billing: { method: "PER_VISIT", when: "MONTHLY", invoiceDay: 15 },
    });
    expect(job).toMatchObject({ billingType: "PER_VISIT", invoiceSchedule: "MONTHLY", invoiceDay: 15, anytime: false, defaultStartMinute: 480, defaultDurationMin: 150, defaultAssigneeIds: [owner.id], recurrenceEndsOn: null });
    let visits = await visitsOf(job.id);
    expect(visits.length).toBeGreaterThanOrEqual(12);
    for (const v of visits) {
      expect(v).toMatchObject({ anytime: false, routeSort: null, source: "RECURRENCE" });
      expect(v.endAt!.getTime() - v.startAt!.getTime()).toBe(150 * 60_000);
      expect(v.assignees.map((a) => a.userId)).toEqual([owner.id]);
    }

    // Skip one occurrence with a reason: it stays skipped through everything below.
    const skipped = visits[2];
    await transitionVisit(owner, skipped.id, "SKIPPED", { skipReason: "CLIENT_CANCELLED", skipNote: "Away that week" });

    // New rule, same time and people (defaults not passed = kept). Ends after 5 visits.
    await updateRecurrence(owner, job.id, { freq: "WEEKLY", interval: 2, byDay: [], startsOn: today, endsOn: null, count: 5 });
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after).toMatchObject({ defaultStartMinute: 480, defaultAssigneeIds: [owner.id] });
    expect(dateOnly(after.recurrenceEndsOn)).toBe(addDays(today, 56));
    visits = await visitsOf(job.id);
    const open = visits.filter((v) => v.state === "SCHEDULED");
    expect(open.map((v) => dateOnly(v.scheduledDate))).toEqual([0, 14, 28, 42, 56].map((n) => addDays(today, n)).filter((d) => d !== dateOnly(skipped.scheduledDate)));
    for (const v of open) expect(v).toMatchObject({ anytime: false, assignees: [{ userId: owner.id }] });
    expect(visits.find((v) => v.id === skipped.id)).toMatchObject({ state: "SKIPPED", skipReason: "CLIENT_CANCELLED", skipNote: "Away that week" });

    // Pause across the 3rd and 4th visits: they go, nothing is generated there; resuming brings them back.
    await expect(setRecurringPause(owner, job.id, addDays(today, 30), addDays(today, 20))).rejects.toThrow(/on or after/);
    await setRecurringPause(owner, job.id, addDays(today, 20), addDays(today, 45));
    const paused = (await visitsOf(job.id)).filter((v) => v.state === "SCHEDULED").map((v) => dateOnly(v.scheduledDate));
    expect(paused.some((d) => d! >= addDays(today, 20) && d! <= addDays(today, 45))).toBe(false);
    expect(paused).toContain(addDays(today, 56));
    await setRecurringPause(owner, job.id, null, null);
    const resumed = (await visitsOf(job.id)).filter((v) => v.state !== "SKIPPED").map((v) => dateOnly(v.scheduledDate));
    expect(resumed).toEqual(open.map((v) => dateOnly(v.scheduledDate)));
  });

  it("one visit's own price is charged once, and locks when invoiced", async () => {
    const { owner, ids, today } = await setup("b");
    const job = await createRecurringJob(owner, { ...ids, title: "Bins", lines, checklistTemplateId: null, repeat: { freq: "WEEKLY", byDay: [], startsOn: today, endsOn: null } });
    expect(job).toMatchObject({ billingType: "PER_VISIT", invoiceSchedule: "MONTHLY", invoiceDay: null, anytime: true }); // the old defaults
    const [first, second] = await visitsOf(job.id);
    const extra = [...lines, { name: "Extra bin", quantity: 1, unitPriceCents: 1500 }];
    await setVisitLines(owner, first.id, extra);
    // A re-priced visit is "touched": a schedule change leaves it alone.
    await updateRecurrence(owner, job.id, { freq: "WEEKLY", byDay: [], startsOn: today, endsOn: null });
    expect((await db.visit.findUniqueOrThrow({ where: { id: first.id } })).lineOverrides).toEqual(extra);

    const charged = async (id: string) => (await db.visitCharge.findMany({ where: { visitId: id }, orderBy: { createdAt: "asc" } })).map((c) => c.totalCents);
    await transitionVisit(owner, first.id, "COMPLETED");
    expect(await charged(first.id)).toEqual([2500, 1000, 1500]);
    await expect(setVisitLines(owner, first.id, lines)).rejects.toThrow(/Reopen/);
    // Reopen, drop the override, complete again: charged once, from the job's lines.
    await transitionVisit(owner, first.id, "SCHEDULED");
    await setVisitLines(owner, first.id, null);
    await transitionVisit(owner, first.id, "COMPLETED");
    expect(await charged(first.id)).toEqual([2500, 1000]);
    // The job's own lines are untouched and the next visit uses them.
    const next = (await db.visit.findFirst({ where: { id: second.id } })) ?? (await visitsOf(job.id)).find((v) => v.state === "SCHEDULED")!;
    await transitionVisit(owner, next.id, "COMPLETED");
    expect(await charged(next.id)).toEqual([2500, 1000]);

    const inv = await invoiceUnbilled(owner, { clientId: ids.clientId, jobId: job.id });
    expect(inv.totalCents).toBe(7000);
    await expect(setVisitLines(owner, first.id, extra)).rejects.toThrow(/already invoiced/);
    await expect(transitionVisit(owner, first.id, "SCHEDULED")).rejects.toThrow(/invoiced/);
    expect(await db.visitCharge.count({ where: { visit: { jobId: job.id }, invoiceLineItemId: null } })).toBe(0);

    // After-each-visit invoicing carries the override onto that visit's invoice.
    await setRecurringInvoicing(owner, job.id, "AFTER_EACH_VISIT", null);
    const third = (await visitsOf(job.id)).find((v) => v.state === "SCHEDULED")!;
    await setVisitLines(owner, third.id, [{ name: "Bin cleaning (double)", quantity: 1, unitPriceCents: 4000 }]);
    await transitionVisit(owner, third.id, "COMPLETED");
    const visitInvoice = await db.invoice.findFirstOrThrow({ where: { lineItems: { some: { visitId: third.id } } }, include: { lineItems: true } });
    expect(visitInvoice.lineItems.map((l) => [l.name, l.totalCents])).toEqual([["Bin cleaning (double)", 4000]]);
  });

  it("a fixed price per month is invoiced once per month, whatever the visits", async () => {
    const { owner, ids, today } = await setup("c");
    const repeat = { freq: "WEEKLY" as const, byDay: [], startsOn: today, endsOn: null };
    await expect(createRecurringJob(owner, { ...ids, title: "Yard", lines, repeat, billing: { method: "FIXED_PRICE", when: "AFTER_EACH_VISIT" } })).rejects.toThrow(/once a month/);
    const job = await createRecurringJob(owner, { ...ids, title: "Yard", lines, checklistTemplateId: null, repeat, billing: { method: "FIXED_PRICE", when: "MONTHLY", invoiceDay: null } });
    expect(job).toMatchObject({ billingType: "FIXED_PRICE", invoiceSchedule: "MONTHLY", totalCents: 3500 });
    await expect(setRecurringInvoicing(owner, job.id, "AFTER_EACH_VISIT", null)).rejects.toThrow(/once a month/);

    // Visits add no charges, and can't be priced one by one.
    const [first] = await visitsOf(job.id);
    await expect(setVisitLines(owner, first.id, lines)).rejects.toThrow(/fixed price/);
    await transitionVisit(owner, first.id, "COMPLETED");
    expect(await db.visitCharge.count({ where: { visit: { jobId: job.id } } })).toBe(0);

    // This month is due today (the job starts today); running again bills nothing more.
    expect(await invoiceRecurringPeriods({ id: job.id })).toBe(1);
    expect(await invoiceRecurringPeriods({ id: job.id })).toBe(0);
    const month = today.slice(0, 7);
    let invoices = await db.invoice.findMany({ where: { jobId: job.id }, orderBy: { number: "asc" }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ status: "DRAFT", totalCents: 3500, instalmentKey: `${job.id}:${month}`, clientId: ids.clientId });
    expect(invoices[0].lineItems.map((l) => [l.name, l.totalCents])).toEqual([["Bin cleaning", 2500], ["Deodorize", 1000]]);

    // A job that has been running since two months ago owes those months too, once each; a voided month is not re-issued.
    const [y, m] = today.split("-").map(Number);
    const twoBack = new Date(Date.UTC(y, m - 3, 5));
    await db.job.update({ where: { id: job.id }, data: { createdAt: twoBack, recurrenceStartsOn: toDbDate(twoBack.toISOString().slice(0, 10)) } });
    await db.invoice.update({ where: { id: invoices[0].id }, data: { status: "VOID" } });
    await setJobClosed(owner, job.id, true);
    expect(await invoiceRecurringPeriods({ id: job.id })).toBe(0); // closed: nothing
    await db.job.update({ where: { id: job.id }, data: { closedAt: null } });
    const [a, b] = await Promise.all([invoiceRecurringPeriods({ id: job.id }), invoiceRecurringPeriods({ id: job.id })]); // two runs at once
    expect(a + b).toBe(2);
    expect(await invoiceRecurringPeriods({ id: job.id })).toBe(0);
    invoices = await db.invoice.findMany({ where: { jobId: job.id }, orderBy: { number: "asc" }, include: { lineItems: true } });
    expect(invoices.map((i) => i.instalmentKey).sort()).toEqual([0, 1, 2].map((n) => `${job.id}:${new Date(Date.UTC(y, m - 3 + n, 1)).toISOString().slice(0, 7)}`));
    expect(await db.visitCharge.count({ where: { visit: { jobId: job.id } } })).toBe(0);
  });
});
