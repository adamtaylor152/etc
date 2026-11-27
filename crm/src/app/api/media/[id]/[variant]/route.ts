// Private photos: owners (session) or a signed URL (emails, client pages). Everyone else gets a 404.
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { VARIANTS, verifyMediaSig } from "@/server/media";
import { getStream } from "@/server/storage";

export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]/[variant]">) {
  const { id, variant } = await ctx.params;
  const url = new URL(req.url);
  if (!(variant in VARIANTS) && variant !== "mms" && variant !== "file") return new Response("Not found", { status: 404 });
  const signed = url.searchParams.has("sig");
  if (signed && !verifyMediaSig(id, variant, url.searchParams.get("exp"), url.searchParams.get("sig"))) return new Response("Forbidden", { status: 403 });
  const user = signed ? null : await currentUser();
  if (!signed && !user) return new Response("Not found", { status: 404 });
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || a.deletedAt || (user && a.businessId !== user.businessId)) return new Response("Not found", { status: 404 });
  // "file": the original of a non-photo attachment, always a download (never rendered inline: it's client-supplied).
  if (variant === "file") {
    const file = a.mediaType === "IMAGE" ? null : await getStream(`${a.storageKey}/file`);
    if (!file) return new Response("Not found", { status: 404 });
    const name = (a.filename ?? `attachment-${a.id.slice(0, 8)}`).replace(/[^\w.-]+/g, "_");
    return new Response(file.stream, {
      headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Content-Length": String(file.size), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
    });
  }
  const mms = variant === "mms";
  const file = await getStream(`${a.storageKey}/${mms ? "mms.jpg" : `${variant}.webp`}`);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: { "Content-Type": mms ? "image/jpeg" : "image/webp", "Content-Length": String(file.size), "Cache-Control": "private, max-age=31536000, immutable", "X-Robots-Tag": "noindex" },
  });
}
