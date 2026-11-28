// Open assessment times for etccrew.ca/book.html's time picker (cross-origin, read-only, cached a minute).
import { publicTimes } from "@/server/booking/slots";
import { businessId } from "@/server/db";
import { env } from "@/server/env";
import { WINDOWS } from "@/server/windows";

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !env.publicOrigins.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET", Vary: "Origin" };
}

export async function GET(req: Request) {
  return Response.json({ windows: WINDOWS, days: await publicTimes(await businessId()) }, { headers: { ...cors(req), "Cache-Control": "public, max-age=60" } });
}
