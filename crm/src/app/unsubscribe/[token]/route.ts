// Unsubscribe from marketing. GET shows a confirm button (so link scanners don't unsubscribe people);
// POST unsubscribes (also what mail apps send for one-click "List-Unsubscribe-Post").
import { db } from "@/server/db";
import { verifySigned } from "@/server/ops/campaigns";
import { logActivity } from "@/server/records";

// A plain HTML response (no app shell, no scripts), dressed like the other client pages: night header with the
// wordmark, one white card, one 52px button. The colours are the tokens from globals.css, written out.
const CSS = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#f2f4f8;color:#14213d;font:16px/1.5 "IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
  header{background:#0e1830;color:#fff}
  header div,main,footer div{width:100%;max-width:40rem;margin:0 auto;padding:0 16px}
  header div{min-height:64px;display:flex;align-items:center;font-size:24px;font-weight:700;letter-spacing:-.015em}
  header span{color:#7cb8ff}
  main{flex:1;padding-top:24px;padding-bottom:32px}
  section{background:#fff;border:1px solid #dfe5ef;border-radius:12px;box-shadow:0 1px 2px rgba(20,33,61,.05);padding:20px}
  h1{margin:0;font-size:1.5rem;line-height:1.2;font-weight:600;letter-spacing:-.015em;text-wrap:balance}
  p{margin:8px 0 0;color:#4a5672}
  form{margin:20px 0 0}
  button{font:inherit;font-weight:600;width:100%;min-height:52px;padding:0 20px;border-radius:8px;border:1px solid #1d6fd8;background:#1d6fd8;color:#fff;cursor:pointer}
  button:hover{background:#1759ad;border-color:#1759ad}
  button:focus-visible{outline:2px solid #1d6fd8;outline-offset:2px}
  footer{border-top:1px solid #dfe5ef;background:#fff;color:#4a5672;font-size:14px}
  footer div{padding-top:20px;padding-bottom:24px}
  footer b{display:block;color:#14213d;font-size:16px;font-weight:600}
`.replace(/\s*\n\s*/g, "");

const page = (body: string) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe · etc.</title><style>${CSS}</style>
  <body><header><div>etc<span>.</span></div></header><main><section>${body}</section></main><footer><div><b>etc.</b>Snow shovelling &amp; odd jobs in Calgary</div></footer></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
);

export async function GET(_req: Request, ctx: RouteContext<"/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  if (!verifySigned(token)) return page("<h1>Link not recognised</h1><p>Reply to any of our emails and we'll take you off the list.</p>");
  return page(`<h1>Unsubscribe from etc. offers?</h1><p>You'll still get messages about your own bookings, quotes and invoices.</p>
    <form method="post"><button>Unsubscribe</button></form>`);
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
