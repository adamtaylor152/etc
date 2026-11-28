// Unsubscribe from marketing. GET shows a confirm button (so link scanners don't unsubscribe people);
// POST unsubscribes (also what mail apps send for one-click "List-Unsubscribe-Post").
import { db } from "@/server/db";
import { verifySigned } from "@/server/ops/campaigns";
import { logActivity } from "@/server/records";

const page = (body: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe · etc.</title>
  <body style="font:16px/1.5 system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#14213d">${body}</body>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
);

export async function GET(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  if (!verifySigned(token)) return page("<h1>Link not recognised</h1><p>Reply to any of our emails and we'll take you off the list.</p>");
  return page(`<h1>Unsubscribe from etc. offers?</h1><p>You'll still get messages about your own bookings, quotes and invoices.</p>
    <form method="post"><button style="font:inherit;padding:12px 22px;border-radius:999px;border:0;background:#1d6fd8;color:#fff;font-weight:600">Unsubscribe</button></form>`);
}

export async function POST(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const clientId = verifySigned(token);
  const c = clientId ? await db.client.findUnique({ where: { id: clientId } }) : null;
  if (!c) return page("<h1>Link not recognised</h1>");
  if (!c.marketingOptOut) {
    await db.client.update({ where: { id: c.id }, data: { marketingOptOut: true, emailMarketingConsentAt: null } });
    await logActivity(db, { businessId: c.businessId, type: "client.unsubscribed", entityType: "Client", entityId: c.id, actorType: "CLIENT", actorClientId: c.id, clientId: c.id });
  }
  return page("<h1>You're unsubscribed</h1><p>No more offers from etc. You'll still hear from us about your own bookings.</p>");
}
