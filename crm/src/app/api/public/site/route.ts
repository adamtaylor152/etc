// Public feed for etccrew.ca: tuition progress (invoiced total + jobs done over time) and the "Our work"
// before/after gallery (only photos an owner marked "show on website" with the client's OK).
// No names or street addresses: captions are community + month.
import { businessId, db } from "@/server/db";
import { env } from "@/server/env";
import { signedMediaPath } from "@/server/media";
import { TZ } from "@/server/dates";

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const cors: Record<string, string> = origin && env.publicOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
  const bid = await businessId();
  const [invoices, visits, photos] = await Promise.all([
    // Every invoice counts from the moment it's created; void and written-off ones drop out. Deposit invoices
    // are counted too: the job invoice already subtracts the paid deposit, so nothing is counted twice.
    db.invoice.findMany({ where: { businessId: bid, status: { notIn: ["VOID", "BAD_DEBT"] } }, select: { createdAt: true, totalCents: true }, orderBy: { createdAt: "asc" } }),
    db.visit.findMany({ where: { businessId: bid, state: "COMPLETED" }, select: { completedAt: true }, orderBy: { completedAt: "asc" } }),
    db.attachment.findMany({
      where: { businessId: bid, showcase: true, showcaseConsentAt: { not: null }, deletedAt: null, kind: { in: ["BEFORE", "AFTER"] }, visitId: { not: null } },
      include: { visit: { include: { property: { include: { community: true } }, job: true } } }, orderBy: { createdAt: "desc" },
    }),
  ]);
  // Cumulative dollars + jobs, one point per day something was invoiced.
  const points = new Map<string, { amount: number; jobs: number }>();
  let sum = 0;
  for (const i of invoices) { sum += i.totalCents; points.set(day(i.createdAt), { amount: Math.round(sum / 100), jobs: 0 }); }
  const progress = [...points].map(([date, v]) => ({ date, amount: v.amount, jobs: visits.filter((x) => x.completedAt && day(x.completedAt) <= date).length })).slice(-60);
  // Before/after pairs per visit.
  const byVisit = new Map<string, { before?: string; after?: string; caption: string }>();
  for (const a of photos) {
    const v = a.visit!;
    const e = byVisit.get(v.id) ?? { caption: `${v.job.kind === "SNOW_PLAN" || v.job.title.startsWith("Snow") ? "Driveway & walk" : v.job.title}${v.property.community ? `, ${v.property.community.name}` : ""} · ${(v.completedAt ?? a.createdAt).toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: TZ })}` };
    const url = env.appUrl + signedMediaPath(a.id, "md", 30);
    if (a.kind === "BEFORE") e.before ??= url; else e.after ??= url;
    byVisit.set(v.id, e);
  }
  const work = [...byVisit.values()].filter((w) => w.before && w.after).slice(0, 12);
  return Response.json({ progress, jobsDone: visits.length, work }, { headers: { ...cors, "Cache-Control": "public, max-age=60" } });
}
