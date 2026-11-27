// Owner photo grid: thumbnails, tap for full size, share-with-client toggle and delete.
import type { Attachment } from "@/generated/prisma/client";
import { photoDelete, photoShare, photoShowcase } from "@/app/(owner)/photo-actions";
import { prettyDateTime } from "@/server/dates";

const KIND: Record<string, string> = { BEFORE: "Before", AFTER: "After", REQUEST_PHOTO: "From client", PROOF: "Proof", OTHER: "Photo", DOCUMENT: "File" };

export function Gallery({ photos, back, controls = true }: { photos: Attachment[]; back: string; controls?: boolean }) {
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-white">
          <a href={`/api/media/${p.id}/lg`} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-tint">
            {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
            <img src={`/api/media/${p.id}/sm`} alt={KIND[p.kind]} loading="lazy" className="size-full object-cover" />
          </a>
          <div className="space-y-1 p-2 text-xs">
            <div className="flex justify-between gap-1"><span className="font-semibold">{KIND[p.kind]}</span><span className="text-ink-soft">{prettyDateTime(p.createdAt)}</span></div>
            {p.caption && <div className="text-ink-soft">{p.caption}</div>}
            {controls && (
              <div className="flex items-center justify-between">
                <form action={photoShare}>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="shared" value={p.sharedWithClient ? "0" : "1"} />
                  <button className={`font-semibold ${p.sharedWithClient ? "text-emerald-700" : "text-ink-soft"}`}>{p.sharedWithClient ? "✓ Client sees" : "Internal"}</button>
                </form>
                {(p.kind === "BEFORE" || p.kind === "AFTER") && (
                  <form action={photoShowcase}>
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="on" value={p.showcase ? "0" : "1"} />
                    <button className={`font-semibold ${p.showcase ? "text-blue" : "text-ink-soft"}`} title="Show on etccrew.ca (only with the client's OK)">{p.showcase ? "★ Website" : "☆ Website"}</button>
                  </form>
                )}
                <form action={photoDelete}>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} />
                  <button className="text-ink-soft" aria-label="Delete photo">Delete</button>
                </form>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
