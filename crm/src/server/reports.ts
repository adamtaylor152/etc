// Tabular reports: one registry feeds the on-screen table (/reports/[report]) and its CSV (/api/export/report/[report]).
// ponytail: every report loads its rows in one query and totals in JS; fine at thousands of rows, paginate when it isn't.
import { addDays, dateOnly, localDayStart, todayLocal, toDbDate, TZ } from "./dates";
import { db } from "./db";
import { clientName } from "./queries";
import { personName } from "./schedule";
import { planProfit } from "./ops/costing";

export type Kind = "text" | "money" | "num";
export type Table = { columns: [string, Kind][]; rows: (string | number | null)[][]; note?: string };
export type Range = { from: string; to: string; person?: string; season?: string }; // person: one team member (timesheets only); season: a Season id (snow plan reports)

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

/** seasonal: picked by snow season instead of a date range. */
type Report = { title: string; sub: string; ranged: boolean; seasonal?: boolean; run: (businessId: string, r: Range) => Promise<Table> };

/** The season a seasonal report is for: the one asked for, else the current one, else the latest. */
export async function reportSeason(businessId: string, id?: string) {
  const seasons = await db.season.findMany({ where: { businessId }, orderBy: { startsOn: "desc" } });
  const today = todayLocal();
  return { seasons, season: seasons.find((s) => s.id === id) ?? seasons.find((s) => dateOnly(s.startsOn)! <= today && dateOnly(s.endsOn)! >= today) ?? seasons[0] ?? null };
}

const PLAN_BILLING = { PER_PUSH: "Per push", PER_EVENT: "Per storm", SEASONAL: "Seasonal" } as const;
const pct = (profit: number, revenue: number) => (revenue > 0 ? `${Math.round((profit / revenue) * 100)}%` : "");
const perVisit = (revenue: number, visits: number) => (visits ? (revenue / visits / 100).toFixed(2) : "");

/** Every snow plan of a season with its money (the rules are planProfit's), and a note saying where labour came from. */
async function seasonPlans(businessId: string, seasonId?: string) {
  const { season } = await reportSeason(businessId, seasonId);
  if (!season) return { plans: [], note: "No snow season is set up yet (Settings)." };
  const jobs = await db.job.findMany({
    where: { businessId, kind: "SNOW_PLAN", seasonId: season.id }, orderBy: { number: "asc" },
    include: {
      client: true, property: { include: { community: true } },
      visits: { where: { state: "COMPLETED" }, select: { id: true, isReturn: true, snowEventId: true, arrivedAt: true, completedAt: true, completedById: true, charges: { where: { invoiceLineItemId: null }, select: { totalCents: true } } } },
    },
  });
  const ids = jobs.map((j) => j.id);
  const [users, lines, time, expenses] = await Promise.all([
    db.user.findMany({ where: { businessId }, select: { id: true, hourlyCostCents: true } }),
    // Invoiced = lines on invoices that aren't void: visit charges (linked by visit) and season instalments (linked by job).
    db.invoiceLineItem.findMany({ where: { invoice: { businessId, status: { not: "VOID" } }, OR: [{ jobId: { in: ids } }, { visit: { jobId: { in: ids } } }] }, select: { totalCents: true, jobId: true, visit: { select: { jobId: true } } } }),
    db.timeEntry.findMany({ where: { businessId, endedAt: { not: null }, jobId: { in: ids } }, select: { jobId: true, visitId: true, userId: true, minutes: true } }),
    db.expense.findMany({ where: { businessId, jobId: { in: ids } }, select: { jobId: true, amountCents: true } }),
  ]);
  const cost = new Map(users.map((u) => [u.id, u.hourlyCostCents]));
  const plans = jobs.map((j) => ({
    job: j,
    ...planProfit({
      invoicedCents: lines.filter((l) => (l.visit?.jobId ?? l.jobId) === j.id).reduce((a, l) => a + l.totalCents, 0),
      visits: j.visits.map((v) => ({ ...v, unbilledCents: v.charges.reduce((a, c) => a + c.totalCents, 0) })),
      time: time.filter((t) => t.jobId === j.id), expenses: expenses.filter((e) => e.jobId === j.id), hourlyCost: (id) => cost.get(id) ?? 0,
    }),
  }));
  const from = plans.reduce((a, p) => ({ timers: a.timers + p.labourFrom.timers, onSite: a.onSite + p.labourFrom.onSite, none: a.none + p.labourFrom.none }), { timers: 0, onSite: 0, none: 0 });
  const note = `${season.name}. Revenue = invoiced (void invoices left out) + charges not invoiced yet. Labour = time entries × each person's hourly cost (${from.timers} visit${from.timers === 1 ? "" : "s"} had a timer); `
    + `visits nobody timed use minutes on site, Arrived to Done, × the hourly cost of whoever completed them (${from.onSite}); ${from.none} had neither and count no labour. Expenses are the ones linked to the plan's job.`;
  return { plans, note };
}


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
  "plan-profit": {
    title: "Snow plan profit", sub: "Each every-snowfall plan for a season: what it brought in, what it cost, and which ones are losing money.", ranged: false, seasonal: true,
    async run(businessId, r) {
      const { plans, note } = await seasonPlans(businessId, r.season);
      const rows = plans.sort((a, b) => a.profitCents - b.profitCents).map((p) => [
        `#${p.job.number} ${clientName(p.job.client)}`, p.job.property.formatted.replace(/, Calgary.*$/, ""), p.job.property.community?.name ?? "", PLAN_BILLING[p.job.snowBillingMode ?? "PER_PUSH"],
        p.storms, p.visitsDone, p.pushes, p.returns, p.invoicedCents, p.unbilledCents, p.labourCents, p.expenseCents, p.profitCents,
        pct(p.profitCents, p.revenueCents), perVisit(p.revenueCents, p.visitsDone), p.losing ? "Losing money" : "",
      ]);
      return {
        columns: [["Plan", "text"], ["Address", "text"], ["Community", "text"], ["Billing", "text"], ["Storms", "num"], ["Visits done", "num"], ["Pushes", "num"], ["Return visits", "num"],
          ["Invoiced", "money"], ["Not yet invoiced", "money"], ["Labour", "money"], ["Expenses", "money"], ["Profit", "money"], ["Margin", "text"], ["Revenue per visit ($)", "text"], ["Flag", "text"]],
        rows, note,
      };
    },
  },
  "community-profit": {
    title: "Snow profit by community", sub: "The season's every-snowfall plans rolled up by community: where the route makes money and where it doesn't.", ranged: false, seasonal: true,
    async run(businessId, r) {
      const { plans, note } = await seasonPlans(businessId, r.season);
      const by = new Map<string, number[]>(); // plans, losing, visits, invoiced, unbilled, labour, expenses, profit
      for (const p of plans) {
        const k = p.job.property.community?.name ?? "No community", row = by.get(k) ?? [0, 0, 0, 0, 0, 0, 0, 0];
        [1, p.losing ? 1 : 0, p.visitsDone, p.invoicedCents, p.unbilledCents, p.labourCents, p.expenseCents, p.profitCents].forEach((n, i) => { row[i] += n; });
        by.set(k, row);
      }
      const rows = [...by].sort((a, b) => a[1][7] - b[1][7]).map(([k, v]) => [k, ...v, pct(v[7], v[3] + v[4]), perVisit(v[3] + v[4], v[2])]);
      return {
        columns: [["Community", "text"], ["Plans", "num"], ["Losing money", "num"], ["Visits done", "num"], ["Invoiced", "money"], ["Not yet invoiced", "money"], ["Labour", "money"], ["Expenses", "money"], ["Profit", "money"], ["Margin", "text"], ["Revenue per visit ($)", "text"]],
        rows, note,
      };
    },
  },
  materials: {
    title: "Materials used", sub: "Ice melt put down in the period, by month and storm, next to what was charged for it.", ranged: true,
    async run(businessId, r) {
      const visits = await db.visit.findMany({
        where: { businessId, state: "COMPLETED", iceMeltApplied: true, completedAt: instants(r) }, orderBy: { completedAt: "asc" },
        select: { completedAt: true, iceMeltBags: true, snowEvent: { select: { name: true } }, charges: { where: { name: { startsWith: "Ice melt" } }, select: { totalCents: true } } },
      });
      const by = new Map<string, [string, string, number, number, number, number]>();
      for (const v of visits) {
        const month = day(v.completedAt).slice(0, 7), storm = v.snowEvent?.name ?? "Not in a storm";
        const row = by.get(`${month}|${storm}`) ?? [month, storm, 0, 0, 0, 0];
        row[2]++; row[3] = Math.round((row[3] + Number(v.iceMeltBags ?? 0)) * 100) / 100; row[4] += v.iceMeltBags == null ? 1 : 0; row[5] += v.charges.reduce((a, c) => a + c.totalCents, 0);
        by.set(`${month}|${storm}`, row);
      }
      return {
        columns: [["Month", "text"], ["Storm", "text"], ["Visits with ice melt", "num"], ["Bags used", "num"], ["Visits with no quantity", "num"], ["Ice melt charged", "money"]],
        rows: [...by.values()],
        note: "Bags are what the crew entered on the visit; a visit with ice melt but no quantity counts 0 bags. Ice melt is charged flat per visit whatever the quantity (nothing when a season price includes it).",
      };
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
export const totals = (t: Table) => t.columns.map(([, kind], i) => (kind === "text" ? null : Math.round(t.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) * 100) / 100)); // rounded: hours and bags are decimals
