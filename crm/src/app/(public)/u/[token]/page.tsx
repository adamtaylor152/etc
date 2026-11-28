// "Send us photos" page for quotes. No login: the link is the key, scoped to one request.
import { Help, LinkProblem, PageTitle } from "@/components/public/kit";
import { Card } from "@/components/ui";
import { PhotoUploader } from "@/components/photo-uploader";
import { db } from "@/server/db";
import { env } from "@/server/env";
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
    return <LinkProblem title="This link has expired">Reply to our email or call us and we&apos;ll send a fresh one.</LinkProblem>;
  }
  const request = await db.request.findUniqueOrThrow({ where: { id: t.token.requestId }, include: { client: true } });
  const photos = await db.attachment.findMany({ where: { requestId: request.id, uploadedByType: "CLIENT", deletedAt: null }, orderBy: { createdAt: "asc" } });
  const endpoint = `/api/public/uploads/${token}`;
  const what = request.services.filter((s) => s !== "Snow shovelling").join(", ");
  return (
    <>
      <PageTitle eyebrow={<>Request #{request.number}{what && ` · ${what}`}</>} title={`Hi ${request.client.firstName}, send us a few photos`}
        sub="We'll price the job from these, no visit needed. Use your phone's camera or pick photos you already have." />
      <div className="grid gap-5">
        <Card title="Add your photos">
          <div className="grid gap-3 sm:grid-cols-2">
            <PhotoUploader endpoint={endpoint} label="Take photos" done="Got them, thanks! Add more any time." />
            <PhotoUploader endpoint={endpoint} label="Choose from library" camera={false} done="Got them, thanks! Add more any time." />
          </div>
          {photos.length > 0 && (
            <div className="mt-5 border-t border-line-soft pt-4">
              <p className="font-semibold tabular-nums">{photos.length} photo{photos.length === 1 ? "" : "s"} sent</p>
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- private media via signed URL
                  <li key={p.id}><img src={signedMediaPath(p.id, "sm", 14)} alt={`Photo ${i + 1} you sent`} className="aspect-square w-full rounded-lg object-cover" /></li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-sm text-ink-soft">Photos are only seen by the etc. crew. Location data is removed before upload.</p>
        </Card>
        <Card title="What helps most">
          <ol className="space-y-3">
            {SHOTS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-tint font-display text-sm font-semibold tabular-nums" aria-hidden>{i + 1}</span>
                <span><span className="block font-semibold">{t}</span><span className="text-ink-soft">{d}</span></span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Help phone={env.phone} email={env.helpEmail} />
    </>
  );
}
