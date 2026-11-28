// Click tracking: records the click, then redirects. The target URL is signed, so this can't be used as an open redirect.
import { db } from "@/server/db";
import { env } from "@/server/env";
import { verifyClick, verifySigned } from "@/server/ops/campaigns";

export async function GET(req: Request, ctx: RouteContext<"/api/m/c/[t]">) {
  const id = verifySigned((await ctx.params).t);
  const u = new URL(req.url);
  const target = u.searchParams.get("u") ?? "";
  if (!id || !/^https?:\/\//.test(target) || !verifyClick(id, target, u.searchParams.get("s") ?? "")) return Response.redirect(env.siteUrl, 302);
  await db.campaignRecipient.updateMany({ where: { id, clickedAt: null }, data: { clickedAt: new Date(), openedAt: new Date() } }).catch(() => {});
  return Response.redirect(target, 302);
}
