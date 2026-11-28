// The client's quote as a PDF, behind the same link token (and the same "not drafts, not archived" rule) as the quote page.
import { db } from "@/server/db";
import { pdfResponse, quotePdf } from "@/server/pdf/documents";
import { peekToken } from "@/server/tokens";

export async function GET(_req: Request, ctx: RouteContext<"/q/[token]/pdf">) {
  const t = await peekToken(db, (await ctx.params).token, ["QUOTE"]);
  const q = t.ok && t.token.quoteId ? await db.quote.findUnique({ where: { id: t.token.quoteId }, select: { id: true, businessId: true, status: true } }) : null;
  if (!q || q.status === "DRAFT" || q.status === "ARCHIVED") return pdfResponse(null);
  return pdfResponse(await quotePdf(q.id, q.businessId));
}
