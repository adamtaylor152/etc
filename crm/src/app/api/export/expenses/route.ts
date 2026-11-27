// Expenses CSV for a month (owners only).
import { currentUser } from "@/server/auth";
import { dateOnly, toDbDate } from "@/server/dates";
import { db } from "@/server/db";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("month=YYYY-MM", { status: 400 });
  const [y, m] = month.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const rows = await db.expense.findMany({ where: { businessId: user.businessId, date: { gte: toDbDate(`${month}-01`), lt: toDbDate(`${next}-01`) } }, orderBy: { date: "asc" } });
  const jobs = new Map((await db.job.findMany({ where: { id: { in: rows.map((r) => r.jobId).filter((x): x is string => !!x) } } })).map((j) => [j.id, `#${j.number} ${j.title}`]));
  const csv = ["date,category,description,amount,job", ...rows.map((r) => [dateOnly(r.date)!, r.category, r.description, (r.amountCents / 100).toFixed(2), r.jobId ? jobs.get(r.jobId) ?? "" : ""].map(cell).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="etc-expenses-${month}.csv"` } });
}
