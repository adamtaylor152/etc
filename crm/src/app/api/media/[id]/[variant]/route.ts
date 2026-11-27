// Private photos: owners (session) or a signed URL (emails, client pages). Everyone else gets a 404.
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { VARIANTS, verifyMediaSig } from "@/server/media";
import { getStream } from "@/server/storage";

export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]/[variant]">) {
  const { id, variant } = await ctx.params;
  const url = new URL(req.url);
  if (!(variant in VARIANTS)) return new Response("Not found", { status: 404 });
  const signed = url.searchParams.has("sig");
  if (signed && !verifyMediaSig(id, variant, url.searchParams.get("exp"), url.searchParams.get("sig"))) return new Response("Forbidden", { status: 403 });
  const user = signed ? null : await currentUser();
  if (!signed && !user) return new Response("Not found", { status: 404 });
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || a.deletedAt || (user && a.businessId !== user.businessId)) return new Response("Not found", { status: 404 });
  const file = await getStream(`${a.storageKey}/${variant}.webp`);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: { "Content-Type": "image/webp", "Content-Length": String(file.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Robots-Tag": "noindex" },
  });
}
