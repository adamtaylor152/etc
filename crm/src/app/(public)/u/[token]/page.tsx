// "Send us photos" page for quotes. No login: the link is the key, scoped to one request.
import { Card } from "@/components/ui";
import { PhotoUploader } from "@/components/photo-uploader";
import { db } from "@/server/db";
import { signedMediaPath } from "@/server/media";
import { peekToken } from "@/server/tokens";

export const metadata = { title: { absolute: "Send us photos · etc." } };

const SHOTS = [
  ["The whole area from the street", "Step back so we can see the size of the job."],
  ["Close-ups of the tricky bits", "Stains, damage, the worst corner."],
  ["How we get there", "Gate, side yard, stairs, where we'd park."],
];

export default async function UploadPage({ params }: PageProps<"/u/[token]">) {
  const { token } = await params;
  const t = await peekToken(db, token, ["PHOTO_UPLOAD"]);
  if (!t.ok || !t.token.requestId) {
    return <Card><h1 className="font-display text-2xl font-bold">This link has expired</h1><p className="mt-2 text-ink-soft">Reply to our email or call us and we&apos;ll send a fresh one.</p></Card>;
  }
  const request = await db.request.findUniqueOrThrow({ where: { id: t.token.requestId }, include: { client: true } });
  const photos = await db.attachment.findMany({ where: { requestId: request.id, uploadedByType: "CLIENT", deletedAt: null }, orderBy: { createdAt: "asc" } });
  const endpoint = `/api/public/uploads/${token}`;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-blue">Request #{request.number} · {request.services.filter((s) => s !== "Snow shovelling").join(", ")}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Hi {request.client.firstName}, send us a few photos</h1>
        <p className="mt-2 text-ink-soft">We&apos;ll price the job from these, no visit needed. Use your phone&apos;s camera or pick photos you already have.</p>
      </div>
      <Card title="What helps most">
        <ol className="space-y-3">
          {SHOTS.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
              <span><span className="block font-semibold">{t}</span><span className="text-sm text-ink-soft">{d}</span></span>
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <div className="grid gap-2 sm:grid-cols-2">
          <PhotoUploader endpoint={endpoint} label="Take photos" done="Got them, thanks! Add more any time." />
          <PhotoUploader endpoint={endpoint} label="Choose from library" camera={false} done="Got them, thanks! Add more any time." />
        </div>
        {photos.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold">{photos.length} photo{photos.length === 1 ? "" : "s"} sent</p>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element -- private media via signed URL
                <li key={p.id}><img src={signedMediaPath(p.id, "sm", 14)} alt="" className="aspect-square w-full rounded-lg object-cover" /></li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-xs text-ink-soft">Photos are only seen by the etc. crew. Location data is removed before upload.</p>
      </Card>
    </div>
  );
}
