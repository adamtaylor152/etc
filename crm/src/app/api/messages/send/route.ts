// Owner sends a text or MMS from the Messages composer. multipart/form-data: key (client id or n<digits>), body, file[].
import { currentUser } from "@/server/auth";
import { MediaError } from "@/server/media";
import { MAX_MMS_FILES, sendText } from "@/server/ops/texts";
import { TransitionError } from "@/server/status/visit";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in again" }, { status: 401 });
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const body = String(form.get("body") ?? "");
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_MMS_FILES) return Response.json({ error: `Up to ${MAX_MMS_FILES} photos per text` }, { status: 400 });
  try {
    const photos = await Promise.all(files.map(async (f) => ({ bytes: Buffer.from(await f.arrayBuffer()), contentType: f.type })));
    const id = await sendText(user, key.startsWith("n") ? { to: `+${key.slice(1)}`, body, photos } : { clientId: key, body, photos });
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    if (e instanceof TransitionError || e instanceof MediaError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
