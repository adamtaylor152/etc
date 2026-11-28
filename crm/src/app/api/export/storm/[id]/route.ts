import { currentOwner } from "@/server/auth";
import { stormReport } from "@/server/stormReport";

const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

export async function GET(_req: Request, ctx: RouteContext<"/api/export/storm/[id]">) {
  const user = await currentOwner();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const { ev, rows } = await stormReport(user.businessId, id);
  const head = ["Address", "Community", "Client", "Push", "State", "On the way", "Arrived", "Completed", "Skipped", "Skip reason", "Skip note", "Depth cm", "Ice melt", "GPS at completion", "Photos"];
  const body = rows.map((r) => [r.address, r.community, r.client, r.push, r.state, r.enRoute, r.arrived, r.completed, r.skipped, r.skipReason, r.skipNote, r.depthCm ?? "", r.iceMelt, r.gps, r.photos.length]);
  return new Response([head, ...body].map((r) => r.map(csv).join(",")).join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="storm-${ev.number}.csv"`, "Cache-Control": "no-store" },
  });
}
