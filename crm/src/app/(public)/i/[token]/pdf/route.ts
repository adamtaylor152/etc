// The client's invoice as a PDF, behind the same link token (and the same "not drafts, not void" rule) as the pay page.
import { db } from "@/server/db";
import { invoicePdf, pdfResponse } from "@/server/pdf/documents";
import { peekToken } from "@/server/tokens";

export async function GET(_req: Request, ctx: RouteContext<"/i/[token]/pdf">) {
  const t = await peekToken(db, (await ctx.params).token, ["INVOICE"]);
  const inv = t.ok && t.token.invoiceId ? await db.invoice.findUnique({ where: { id: t.token.invoiceId }, select: { id: true, businessId: true, status: true } }) : null;
  if (!inv || inv.status === "DRAFT" || inv.status === "VOID") return pdfResponse(null);
  return pdfResponse(await invoicePdf(inv.id, inv.businessId));
}
