// CSV of any tabular report: /api/export/report/gst?from=2026-01-01&to=2026-03-31. Money columns are plain dollars.
import { currentOwner } from "@/server/auth";
import { toCsv } from "@/server/csv";
import { parseRange, REPORTS } from "@/server/reports";

export async function GET(req: Request, ctx: RouteContext<"/api/export/report/[report]">) {
  const user = await currentOwner();
  const { report } = await ctx.params;
  const def = REPORTS[report];
  if (!user || !def) return new Response("Not found", { status: 404 });
  const r = parseRange(Object.fromEntries(new URL(req.url).searchParams));
  const t = await def.run(user.businessId, r);
  const rows = t.rows.map((row) => row.map((v, i) => (t.columns[i][1] === "money" && typeof v === "number" ? (v / 100).toFixed(2) : v)));
  return new Response(toCsv([t.columns.map(([l]) => l), ...rows]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="etc-${report}${def.ranged ? `-${r.from}-to-${r.to}` : ""}.csv"`, "Cache-Control": "no-store" },
  });
}
