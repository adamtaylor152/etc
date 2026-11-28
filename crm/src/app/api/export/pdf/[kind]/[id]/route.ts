// Owner PDF downloads: /api/export/pdf/invoice/<id>, /quote/<id>, /statement/<clientId>?range=zero|from&from=YYYY-MM-DD
import { currentOwner } from "@/server/auth";
import { invoicePdf, pdfResponse, quotePdf, statementPdf } from "@/server/pdf/documents";
import { parseStatementRange } from "@/server/statement";

export async function GET(req: Request, ctx: RouteContext<"/api/export/pdf/[kind]/[id]">) {
  const user = await currentOwner();
  const { kind, id } = await ctx.params;
  if (!user) return new Response("Not found", { status: 404 });
  if (kind === "invoice") return pdfResponse(await invoicePdf(id, user.businessId));
  if (kind === "quote") return pdfResponse(await quotePdf(id, user.businessId));
  if (kind === "statement") return pdfResponse(await statementPdf(id, user.businessId, parseStatementRange(Object.fromEntries(new URL(req.url).searchParams))));
  return new Response("Not found", { status: 404 });
}
