// Records the Google-review click, then sends the client to the business's Google review page.
import { db } from "@/server/db";
import { env } from "@/server/env";
import { peekToken } from "@/server/tokens";

export async function GET(_req: Request, ctx: RouteContext<"/r/[token]/go">) {
  const { token } = await ctx.params;
  const t = await peekToken(db, token, ["REVIEW"]);
  if (!t.ok || !t.token.redirectPath) return Response.redirect(env.siteUrl, 302);
  const r = await db.reviewRequest.findUnique({ where: { id: t.token.redirectPath } });
  if (!r) return Response.redirect(env.siteUrl, 302);
  if (!r.googleClickedAt) await db.reviewRequest.update({ where: { id: r.id }, data: { googleClickedAt: new Date() } });
  const biz = await db.business.findUniqueOrThrow({ where: { id: r.businessId } });
  return Response.redirect(biz.googleReviewUrl ?? env.siteUrl, 302);
}
