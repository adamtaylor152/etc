// Global search for the top bar, and client pickers (?only=clients: active clients by name, email or phone). Owners only.
import { currentOwner } from "@/server/auth";
import { search, searchClients } from "@/server/search";

export async function GET(req: Request) {
  const user = await currentOwner();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const q = p.get("q") ?? "";
  return Response.json({ hits: p.get("only") === "clients" ? await searchClients(user.businessId, q, { take: 12, activeOnly: true }) : await search(user.businessId, q) });
}
