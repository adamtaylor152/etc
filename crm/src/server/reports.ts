// Tabular reports: one registry feeds the on-screen table (/reports/[report]) and its CSV (/api/export/report/[report]).
// ponytail: every report loads its rows in one query and totals in JS; fine at thousands of rows, paginate when it isn't.
import { addDays, dateOnly, localDayStart, todayLocal, toDbDate, TZ } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { personName } from "./schedule";

export type Kind = "text" | "money" | "num";
export type Table = { columns: [string, Kind][]; rows: (string | number | null)[][]; note?: string };
export type Range = { from: string; to: string; person?: string }; // person: one team member (timesheets only)

/** ?from&to, or a preset (?range=month|last-month|year|12m). Defaults to this calendar year. Pure, unit-tested. */
export function parseRange(sp: { from?: unknown; to?: unknown; range?: unknown }, today = todayLocal(), fallback = "year"): Range & { preset: string } {
  const ok = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (ok(sp.from) && ok(sp.to) && sp.from <= sp.to) return { from: sp.from, to: sp.to, preset: "custom" };
  const [y, m] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const preset = typeof sp.range === "string" && sp.range in PRESETS ? sp.range : fallback;
  if (preset === "month") return { from: first(y, m), to: today, preset };
  if (preset === "last-month") { const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]; return { from: first(py, pm), to: addDays(first(y, m), -1), preset }; }
  if (preset === "12m") return { from: addDays(today, -364), to: today, preset };
  return { from: `${y}-01-01`, to: today, preset: "year" };
}
export const PRESETS: Record<string, string> = { month: "This month", "last-month": "Last month", year: "This year", "12m": "Last 12 months" };

/** Inclusive calendar days -> [start instant, end instant) in Calgary time. */
export const instants = (r: Range) => ({ gte: localDayStart(r.from), lt: localDayStart(addDays(r.to, 1)) });
const dates = (r: Range) => ({ gte: toDbDate(r.from), lte: toDbDate(r.to) });
const day = (d: Date | null) => (d ? d.toLocaleDateString("en-CA", { timeZone: TZ }) : "");

/** Which overdue bucket an unpaid invoice falls in. Pure, unit-tested. */
export const AGE_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;
export function ageBucket(dueOn: string | null, today: string) {
  if (!dueOn || dueOn >= today) return 0;
  const days = Math.round((Date.parse(today) - Date.parse(dueOn)) / 86_400_000);
  return days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
}

type Report = { title: string; sub: string; ranged: boolean; run: (businessId: string, r: Range) => Promise<Table> };

export const REPORTS: Record<string, Report> = {
  "aged-receivables": {
    title: "Aged receivables", sub: "Who owes what, and how late it is. As of today.", ranged: false,
    async run(businessId) {
      const today = todayLocal();
      const invs = await db.invoice.findMany({ where: { businessId, status: "AWAITING_PAYMENT" }, include: { client: true } });
      const by = new Map<string, { name: string; b: number[] }>();
      for (const i of invs) {
        const row = by.get(i.clientId) ?? { name: clientName(i.client), b: [0, 0, 0, 0, 0] };
        row.b[ageBucket(dateOnly(i.dueOn), today)] += i.totalCents - i.amountPaidCents;
        by.set(i.clientId, row);
      }
      const rows = [...by.values()].map((r) => [r.name, ...r.b, r.b.reduce((a, c) => a + c, 0)]).sort((a, b) => (b[6] as number) - (a[6] as number));
      return { columns: [["Client", "text"], ...AGE_BUCKETS.map((l) => [l, "money"] as [string, Kind]), ["Total", "money"]], rows };
    },
  },
  gst: {
    title: "GST collected", sub: "Tax on invoices issued in the period (accrual basis), for your GST return.", ranged: true,
    async run(businessId, r) {
      const [biz, invs] = await Promise.all([
        db.business.findUniqueOrThrow({ where: { id: businessId } }),
        db.invoice.findMany({ where: { businessId, status: { in: ["AWAITING_PAYMENT", "PAID", "BAD_DEBT"] }, issuedOn: dates(r) }, include: { client: true }, orderBy: { issuedOn: "asc" } }),
      ]);
      // With tax-included prices the total already contains the GST; either way sales before tax = total - tax.
      const rows = invs.map((i) => [`#${i.number}`, dateOnly(i.issuedOn) ?? "", clientName(i.client), i.totalCents - i.taxCents, i.taxCents, i.totalCents]);
      return {
        columns: [["Invoice", "text"], ["Issued", "text"], ["Client", "text"], ["Sales before tax", "money"], [biz.taxName, "money"], ["Total", "money"]], rows,
        note: biz.taxRegistered ? `${biz.taxName} ${(biz.taxRateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%${biz.taxNumber ? ` · #${biz.taxNumber}` : ""}. Deposits carry no tax; it is charged on the final invoice.` : "The business is not set as GST-registered (Settings), so no tax is being charged.",
      };
    },
  },
  "gst-paid": {
    title: "GST paid", sub: "GST on expenses in the period (input tax credits), to set against GST collected.", ranged: true,
    async run(businessId, r) {
      const rows = await db.expense.findMany({ where: { businessId, date: dates(r) }, orderBy: { date: "asc" } });
      return {
        columns: [["Date", "text"], ["Bought from", "text"], ["What", "text"], ["Category", "text"], ["Before GST", "money"], ["GST", "money"], ["Paid", "money"]],
        rows: rows.map((e) => [dateOnly(e.date) ?? "", e.vendor ?? "", e.description, e.category, e.amountCents - e.gstCents, e.gstCents, e.amountCents]),
        note: "Only expenses with a GST amount entered count toward the GST column.",
      };
    },
  },
  "client-balances": {
    title: "Client balances", sub: "Everyone who owes money or has credit waiting. As of today.", ranged: false,
    async run(businessId) {
      const [owing, credits] = await Promise.all([
        db.invoice.groupBy({ by: ["clientId"], where: { businessId, status: "AWAITING_PAYMENT" }, _sum: { totalCents: true, amountPaidCents: true }, _count: true }),
        db.clientCredit.groupBy({ by: ["clientId"], where: { businessId, appliedToInvoiceId: null }, _sum: { amountCents: true } }),
      ]);
      const clients = await db.client.findMany({ where: { id: { in: [...owing.map((o) => o.clientId), ...credits.map((c) => c.clientId)] } } });
      const rows = clients.map((c) => {
        const o = owing.find((x) => x.clientId === c.id), owe = (o?._sum.totalCents ?? 0) - (o?._sum.amountPaidCents ?? 0);
        const credit = credits.find((x) => x.clientId === c.id)?._sum.amountCents ?? 0;
        return [clientName(c), c.email, o?._count ?? 0, owe, credit, owe - credit];
      }).sort((a, b) => (b[5] as number) - (a[5] as number));
      return { columns: [["Client", "text"], ["Email", "text"], ["Open invoices", "num"], ["Owing", "money"], ["Credit", "money"], ["Net", "money"]], rows };
    },
  },
  "lead-source": {
    title: "Lead source", sub: "Where new clients came from in the period, and what they turned into.", ranged: true,
    async run(businessId, r) {
      const clients = await db.client.findMany({
        where: { businessId, createdAt: instants(r) },
        select: { leadSource: true, _count: { select: { quotes: { where: { sentAt: { not: null } } }, jobs: true } }, payments: { select: { amountCents: true, refundedCents: true } } },
      });
      const by = new Map<string, number[]>();
      for (const c of clients) {
        const row = by.get(c.leadSource || "Not recorded") ?? [0, 0, 0, 0, 0];
        row[0]++; row[1] += c._count.quotes; row[2] += c._count.jobs; row[3] += c._count.jobs ? 1 : 0; row[4] += c.payments.reduce((a, p) => a + p.amountCents - p.refundedCents, 0);
        by.set(c.leadSource || "Not recorded", row);
      }
      const rows = [...by].map(([k, v]) => [k, v[0], v[1], v[2], v[0] ? `${Math.round((100 * v[3]) / v[0])}%` : "", v[4]]).sort((a, b) => (b[5] as number) - (a[5] as number));
      return { columns: [["Source", "text"], ["New clients", "num"], ["Quotes sent", "num"], ["Jobs", "num"], ["Became a job", "text"], ["Paid so far", "money"]], rows };
    },
  },
  timesheets: {
    title: "Timesheets", sub: "Every time entry in the period, with what it cost.", ranged: true,
    async run(businessId, r) {
      const entries = await db.timeEntry.findMany({ where: { businessId, userId: r.person || undefined, endedAt: { not: null }, startedAt: instants(r) }, include: { user: true }, orderBy: { startedAt: "asc" } });
      const jobs = await db.job.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.jobId).filter((x): x is string => !!x))] } }, select: { id: true, number: true, title: true } });
      const rows = entries.map((e) => {
        const j = jobs.find((x) => x.id === e.jobId), min = e.minutes ?? 0;
        return [day(e.startedAt), personName(e.user), j ? `#${j.number} ${j.title}` : "General", e.note ?? "", Math.round((min / 60) * 100) / 100, Math.round((min / 60) * e.user.hourlyCostCents), e.approvedAt ? "Yes" : "No"];
      });
      return { columns: [["Date", "text"], ["Person", "text"], ["Job", "text"], ["Note", "text"], ["Hours", "num"], ["Cost", "money"], ["Approved", "text"]], rows };
    },
  },
  payments: {
    title: "Payments", sub: "Money received in the period. Tips are their own column: never part of an invoice, never taxed.", ranged: true,
    async run(businessId, r) {
      const pays = await db.payment.findMany({ where: { businessId, receivedAt: instants(r) }, include: { client: true, invoice: { select: { number: true } } }, orderBy: { receivedAt: "asc" } });
      return {
        columns: [["Date", "text"], ["Client", "text"], ["Invoice", "text"], ["Method", "text"], ["Amount", "money"], ["Refunded", "money"], ["Net", "money"], ["Tip", "money"], ["Stripe fee", "money"]],
        rows: pays.map((p) => [day(p.receivedAt), clientName(p.client), `#${p.invoice.number}`, p.method, p.amountCents, p.refundedCents, p.amountCents - p.refundedCents, p.tipCents ?? 0, p.feeCents ?? 0]),
      };
    },
  },
  invoices: {
    title: "Invoices", sub: "Invoices issued in the period.", ranged: true,
    async run(businessId, r) {
      const invs = await db.invoice.findMany({ where: { businessId, issuedOn: dates(r) }, include: { client: true }, orderBy: { number: "asc" } });
      return {
        columns: [["Invoice", "text"], ["Issued", "text"], ["Due", "text"], ["Client", "text"], ["Subject", "text"], ["Status", "text"], ["Total", "money"], ["Paid", "money"], ["Balance", "money"]],
        rows: invs.map((i) => [`#${i.number}`, dateOnly(i.issuedOn) ?? "", dateOnly(i.dueOn) ?? "", clientName(i.client), i.subject ?? "", i.status, i.totalCents, i.amountPaidCents, i.status === "VOID" ? 0 : i.totalCents - i.amountPaidCents]),
      };
    },
  },
  quotes: {
    title: "Quotes", sub: "Quotes created in the period.", ranged: true,
    async run(businessId, r) {
      const qs = await db.quote.findMany({ where: { businessId, createdAt: instants(r) }, include: { client: true }, orderBy: { number: "asc" } });
      return {
        columns: [["Quote", "text"], ["Created", "text"], ["Sent", "text"], ["Client", "text"], ["Title", "text"], ["Status", "text"], ["Total", "money"]],
        rows: qs.map((q) => [`#${q.number}`, day(q.createdAt), day(q.sentAt), clientName(q.client), q.title ?? "", q.status, q.totalCents]),
      };
    },
  },
  jobs: {
    title: "Jobs", sub: "Jobs created in the period, with what has been invoiced.", ranged: true,
    async run(businessId, r) {
      const jobs = await db.job.findMany({
        where: { businessId, createdAt: instants(r) }, orderBy: { number: "asc" },
        include: { client: true, property: true, _count: { select: { visits: { where: { state: "COMPLETED" } } } }, invoices: { where: { status: { not: "VOID" } }, select: { totalCents: true } } },
      });
      return {
        columns: [["Job", "text"], ["Created", "text"], ["Client", "text"], ["Address", "text"], ["Title", "text"], ["Type", "text"], ["Visits done", "num"], ["Invoiced", "money"]],
        rows: jobs.map((j) => [`#${j.number}`, day(j.createdAt), clientName(j.client), j.property.formatted, j.title, j.kind, j._count.visits, j.invoices.reduce((a, i) => a + i.totalCents, 0)]),
      };
    },
  },
};

/** Column sums for money and number columns (null where a sum makes no sense). */
export const totals = (t: Table) => t.columns.map(([, kind], i) => (kind === "text" ? null : t.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0)));
