// The paged lists filter in the database. These filters must agree with the pure rules the rest of the app shows:
// invoiceView (PAST_DUE / PARTIAL are computed) and computeJobStatus (via jobsWithStatus).
import { afterAll, describe, expect, it } from "vitest";
import { invoiceView, type InvoiceView } from "@/server/billing/invoice";
import { addDays, dateOnly, todayLocal, toDbDate } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { invoiceViewWhere, jobStatuses, jobsWithStatus } from "@/server/queries";

const t = `lq${Date.now().toString(36)}`;
let clientId = "";
afterAll(async () => {
  await db.visit.deleteMany({ where: { job: { clientId } } });
  await db.job.deleteMany({ where: { clientId } });
  await db.invoice.deleteMany({ where: { clientId } });
  await db.property.deleteMany({ where: { clientId } });
  await db.client.deleteMany({ where: { id: clientId } });
});

describe("list filters in the database", () => {
  it("invoiceViewWhere picks exactly the invoices invoiceView gives each view", async () => {
    const bid = await businessId();
    const today = todayLocal();
    clientId = (await db.client.create({ data: { businessId: bid, firstName: "List", lastName: t, email: `${t}@example.com`, source: "MANUAL" } })).id;
    const n0 = ((await db.invoice.aggregate({ where: { businessId: bid }, _max: { number: true } }))._max.number ?? 0) + 1000;
    const rows = [
      { status: "DRAFT", due: null, paid: 0 }, { status: "AWAITING_PAYMENT", due: null, paid: 0 }, { status: "AWAITING_PAYMENT", due: 0, paid: 0 }, // due today is not past due
      { status: "AWAITING_PAYMENT", due: 5, paid: 2500 }, { status: "AWAITING_PAYMENT", due: -1, paid: 0 }, { status: "AWAITING_PAYMENT", due: -1, paid: 2500 }, // late beats part-paid
      { status: "AWAITING_PAYMENT", due: 5, paid: 10_000 }, { status: "PAID", due: -9, paid: 10_000 }, { status: "BAD_DEBT", due: -9, paid: 0 }, { status: "VOID", due: -9, paid: 2500 },
    ] as const;
    await db.invoice.createMany({ data: rows.map((r, i) => ({ businessId: bid, number: n0 + i, clientId, etransferRef: `${t}-${i}`, status: r.status, totalCents: 10_000, amountPaidCents: r.paid, dueOn: r.due == null ? null : toDbDate(addDays(today, r.due)) })) });
    const mine = await db.invoice.findMany({ where: { clientId } });
    const counts: Record<string, number> = {};
    for (const v of ["DRAFT", "AWAITING_PAYMENT", "PARTIAL", "PAST_DUE", "PAID", "BAD_DEBT", "VOID"] as InvoiceView[]) {
      const want = mine.filter((i) => invoiceView({ ...i, dueOn: dateOnly(i.dueOn) }, today) === v).map((i) => i.number).sort();
      const got = (await db.invoice.findMany({ where: { clientId, ...invoiceViewWhere(v, today) } })).map((i) => i.number).sort();
      expect(got, v).toEqual(want);
      counts[v] = got.length;
    }
    expect(counts).toEqual({ DRAFT: 1, AWAITING_PAYMENT: 3, PARTIAL: 1, PAST_DUE: 2, PAID: 1, BAD_DEBT: 1, VOID: 1 });
  });

  it("jobStatuses gives every job the status jobsWithStatus does, without reading closed jobs' visits", async () => {
    const bid = await businessId();
    const today = todayLocal();
    const formatted = `${t} List Rd NW, Calgary`;
    const property = await db.property.create({ data: { businessId: bid, clientId, formatted, normalized: formatted.toLowerCase() } });
    const n0 = ((await db.job.aggregate({ where: { businessId: bid }, _max: { number: true } }))._max.number ?? 0) + 1000;
    const jobs = [{ visit: -2, closed: false }, { visit: 0, closed: false }, { visit: 3, closed: false }, { visit: null, closed: false }, { visit: -2, closed: true }];
    for (const [i, j] of jobs.entries()) {
      const job = await db.job.create({ data: { businessId: bid, number: n0 + i, clientId, propertyId: property.id, kind: "ONE_OFF", title: `List ${i}`, closedAt: j.closed ? new Date() : null } });
      if (j.visit != null) await db.visit.create({ data: { businessId: bid, jobId: job.id, propertyId: property.id, scheduledDate: toDbDate(addDays(today, j.visit)) } });
    }
    const slim = await jobStatuses({ clientId }, today);
    expect(slim.map((j) => [j.number, j.status])).toEqual((await jobsWithStatus({ clientId }, today)).map((j) => [j.number, j.status]));
    expect(slim.map((j) => j.status)).toEqual(["ARCHIVED", "UNSCHEDULED", "UPCOMING", "TODAY", "LATE"]); // newest first
    expect(slim[0].visits).toEqual([]);
  });
});
