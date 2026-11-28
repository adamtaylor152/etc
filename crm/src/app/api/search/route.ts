// Global search for the top bar (owners only).
import { currentOwner } from "@/server/auth";
import { search } from "@/server/search";

export async function GET(req: Request) {
  const user = await currentOwner();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await search(user.businessId, q) });
}
