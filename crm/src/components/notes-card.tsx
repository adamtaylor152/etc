// Internal notes for any record: pinned first, photos/files, edit, delete. Client notes can link downstream.
import type { Attachment, Note } from "@/generated/prisma/client";
import { Paperclip, Pin } from "lucide-react";
import { noteAdd, noteDelete, noteEdit, notePin } from "@/app/(owner)/client-actions";
import { prettyDateTime } from "@/server/dates";
import { ConfirmButton } from "./confirm-button";

type N = Note & { attachments: Attachment[] };

export function NotesCard({ notes, target, path, title = "Internal notes", isClient = false }: {
  notes: N[]; target: Partial<Record<"clientId" | "requestId" | "quoteId" | "jobId" | "visitId" | "invoiceId", string>>; path: string; title?: string; isClient?: boolean;
}) {
  const own = (n: N) => Object.entries(target).every(([k, v]) => (n as unknown as Record<string, unknown>)[k] === v);
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-card">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <form action={noteAdd} className="mb-4 space-y-2">
        {Object.entries(target).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="path" value={path} />
        <textarea name="body" rows={2} placeholder="Add a note (gate code, dog, where to leave cash…)" className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-blue" />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-blue"><Paperclip className="size-3.5" aria-hidden />Attach<input type="file" name="file" multiple className="sr-only" /></label>
          {isClient && <label className="flex items-center gap-1"><input type="checkbox" name="pinned" className="size-3.5" />Pin to top</label>}
          {isClient && <label className="flex items-center gap-1" title="Also show this note on the client's requests, quotes and jobs"><input type="checkbox" name="linkDownstream" value="on" defaultChecked className="size-3.5" />Show on their work</label>}
          <button className="ml-auto inline-flex min-h-8 items-center rounded-lg bg-navy px-3 text-xs font-semibold text-white">Save note</button>
        </div>
      </form>
      {notes.length ? (
        <ol className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className={`rounded-lg p-3 text-sm ${n.pinned ? "border border-amber-200 bg-amber-50" : "bg-tint"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs text-ink-soft">
                {n.pinned && <Pin className="size-3 text-amber-700" aria-label="Pinned" />}
                <span>{prettyDateTime(n.createdAt)}{n.editedAt && " · edited"}{!own(n) && " · from client"}</span>
                <span className="ml-auto flex gap-2">
                  {isClient && own(n) && (
                    <form action={notePin}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} /><input type="hidden" name="pinned" value={n.pinned ? "0" : "1"} /><button className="font-semibold hover:text-navy">{n.pinned ? "Unpin" : "Pin"}</button></form>
                  )}
                  <form action={noteDelete}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} /><ConfirmButton message="Delete this note?" className="font-semibold hover:text-red-700">Delete</ConfirmButton></form>
                </span>
              </div>
              {n.body && (
                <details className="group">
                  <summary className="cursor-text list-none whitespace-pre-line [&::-webkit-details-marker]:hidden">{n.body}<span className="ml-2 text-xs font-semibold text-blue opacity-0 group-hover:opacity-100">Edit</span></summary>
                  <form action={noteEdit} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} />
                    <textarea name="body" defaultValue={n.body} rows={3} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
                    <button className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                  </form>
                </details>
              )}
              {n.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.attachments.map((a) => a.mediaType === "IMAGE" ? (
                    <a key={a.id} href={`/api/media/${a.id}/lg`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media */}
                      <img src={`/api/media/${a.id}/sm`} alt="Note attachment" className="size-16 rounded-md object-cover" />
                    </a>
                  ) : (
                    <a key={a.id} href={`/api/media/${a.id}/file`} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-blue"><Paperclip className="size-3" />{a.filename ?? "File"}</a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-ink-soft">No notes yet.</p>}
    </section>
  );
}
