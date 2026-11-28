// CSV of every client, in the same columns /clients/import reads (so it doubles as a template and a backup).
import { currentOwner } from "@/server/auth";
import { toCsv } from "@/server/csv";
import { db } from "@/server/db";
import { CLIENT_COLUMNS } from "@/server/ops/client-import";

export async function GET() {
  const user = await currentOwner();
  if (!user) return new Response("Not found", { status: 404 });
  const clients = await db.client.findMany({
    where: { businessId: user.businessId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { properties: { where: { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 1 } },
  });
  const rows = clients.map((c) => [c.firstName, c.lastName, c.companyName, c.email, c.phone, c.properties[0]?.formatted, c.tags.join("; "), c.leadSource, c.notes, c.archivedAt ? "Archived" : "Active", c.createdAt.toISOString().slice(0, 10)]);
  return new Response(toCsv([[...CLIENT_COLUMNS, "Status", "Added"], ...rows]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="etc-clients.csv"', "Cache-Control": "no-store" },
  });
}
