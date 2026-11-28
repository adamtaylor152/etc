// Owner photo grid: thumbnails, tap for full size, share-with-client toggle and delete.
import type { Attachment } from "@/generated/prisma/client";
import { Eye, EyeOff, Film, Paperclip, Star } from "lucide-react";
import { photoDelete, photoShare, photoShowcase } from "@/app/(owner)/photo-actions";
import { prettyDateTime } from "@/server/dates";
import { ConfirmButton } from "./confirm-button";

const KIND: Record<string, string> = { BEFORE: "Before", AFTER: "After", REQUEST_PHOTO: "From client", PROOF: "Proof", OTHER: "Photo", DOCUMENT: "File", TEXT_PHOTO: "Texted" };
const ctl = "inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-semibold hover:bg-tint";

export function Gallery({ photos, back, controls = true }: { photos: Attachment[]; back: string; controls?: boolean }) {
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-lg border border-line bg-white">
          {p.mediaType === "IMAGE" ? (
            <a href={`/api/media/${p.id}/lg`} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-tint">
              {/* eslint-disable-next-line @next/next/no-img-element -- private media, our own variants */}
              <img src={`/api/media/${p.id}/sm`} alt={KIND[p.kind]} loading="lazy" className="size-full object-cover" />
            </a>
          ) : (
            <a href={`/api/media/${p.id}/file`} className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 bg-tint p-2 text-center text-sm font-semibold text-blue hover:text-blue-deep">
              {p.mediaType === "VIDEO" ? <Film className="size-5" aria-hidden /> : <Paperclip className="size-5" aria-hidden />}
              <span className="line-clamp-2 break-all">{p.filename ?? "Download"}</span>
            </a>
          )}
          <div className="space-y-1 px-2.5 py-2 text-xs">
            <div className="flex flex-wrap justify-between gap-x-2"><span className="font-semibold">{KIND[p.kind]}</span><span className="tabular-nums text-ink-soft">{prettyDateTime(p.createdAt)}</span></div>
            {p.caption && <div className="text-ink-soft">{p.caption}</div>}
            {controls && (
              <div className="-mx-1 flex flex-wrap items-center justify-between gap-x-1">
                <form action={photoShare}>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="shared" value={p.sharedWithClient ? "0" : "1"} />
                  <button title={p.sharedWithClient ? "The client can see this. Select to make it internal." : "Only you can see this. Select to share it with the client."} className={`${ctl} ${p.sharedWithClient ? "text-emerald-700" : "text-ink-soft"}`}>
                    {p.sharedWithClient ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}{p.sharedWithClient ? "Client sees" : "Internal"}
                  </button>
                </form>
                {(p.kind === "BEFORE" || p.kind === "AFTER") && (
                  <form action={photoShowcase}>
                    <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="on" value={p.showcase ? "0" : "1"} />
                    <button aria-pressed={p.showcase} title="Show on etccrew.ca (only with the client's OK)" className={`${ctl} ${p.showcase ? "text-blue" : "text-ink-soft"}`}>
                      <Star className={`size-3.5 ${p.showcase ? "fill-current" : ""}`} aria-hidden />{p.showcase ? "On website" : "Website"}
                    </button>
                  </form>
                )}
                <form action={photoDelete}>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} />
                  <ConfirmButton message="Delete this photo? This can't be undone." className="inline-flex min-h-8 items-center rounded-md px-1 font-medium text-ink-soft hover:bg-red-50 hover:text-red-700" aria-label="Delete photo">Delete</ConfirmButton>
                </form>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
