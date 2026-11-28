// Open tracking pixel for campaign emails (approximate: Apple Mail preloads images).
import { db } from "@/server/db";
import { verifySigned } from "@/server/ops/campaigns";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, ctx: RouteContext<"/api/m/o/[t]">) {
  const id = verifySigned((await ctx.params).t);
  if (id) await db.campaignRecipient.updateMany({ where: { id, openedAt: null }, data: { openedAt: new Date() } }).catch(() => {});
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
}
