// Internal notes for any record: pinned first, photos/files, edit, delete. Client notes can link downstream.
import type { Attachment, Note } from "@/generated/prisma/client";
import { Paperclip, Pin } from "lucide-react";
import { noteAdd, noteDelete, noteEdit, notePin } from "@/app/(owner)/client-actions";
import { prettyDateTime } from "@/server/dates";
import { ConfirmButton } from "./confirm-button";
import { Button, Card, Textarea } from "./ui";

type N = Note & { attachments: Attachment[] };

export function NotesCard({ notes, target, path, title = "Internal notes", isClient = false }: {
  notes: N[]; target: Partial<Record<"clientId" | "requestId" | "quoteId" | "jobId" | "visitId" | "invoiceId", string>>; path: string; title?: string; isClient?: boolean;
}) {
  const own = (n: N) => Object.entries(target).every(([k, v]) => (n as unknown as Record<string, unknown>)[k] === v);
  const check = "flex min-h-8 items-center gap-1.5 text-[13px] text-ink-soft";
  const act = "rounded-md font-medium text-ink-soft hover:text-navy";
  return (
    <Card title={title}>
      <form action={noteAdd} className="space-y-2">
        {Object.entries(target).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="path" value={path} />
        <Textarea name="body" rows={2} aria-label="New note" placeholder="Add a note (gate code, dog, where to leave cash…)" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="flex min-h-8 min-w-0 items-center gap-1.5 text-ink-soft">
            <Paperclip className="size-4 shrink-0" aria-hidden /><span className="sr-only">Attach photos or files</span>
            <input type="file" name="file" multiple className="w-56 max-w-full text-xs text-ink-soft file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-solid file:border-line file:bg-white file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-navy hover:file:bg-tint" />
          </label>
          {isClient && <label className={check}><input type="checkbox" name="pinned" className="size-4" />Pin to top</label>}
          {isClient && <label className={check} title="Also show this note on the client's requests, quotes and jobs"><input type="checkbox" name="linkDownstream" value="on" defaultChecked className="size-4" />Show on their work</label>}
          <Button variant="secondary" className="ml-auto">Save note</Button>
        </div>
      </form>
      {notes.length ? (
        <ol className="mt-4 space-y-1 border-t border-line-soft pt-2">
          {notes.map((n) => (
            <li key={n.id} className={`-mx-2 rounded-lg px-2 py-2.5 text-sm ${n.pinned ? "bg-amber-50" : ""}`}>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                {n.pinned && <span className="inline-flex items-center gap-1 font-semibold text-amber-900"><Pin className="size-3.5" aria-hidden />Pinned</span>}
                <span className="tabular-nums">{prettyDateTime(n.createdAt)}{n.editedAt && " · edited"}{!own(n) && " · from client"}</span>
                <span className="ml-auto flex gap-3">
                  {isClient && own(n) && (
                    <form action={notePin}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} /><input type="hidden" name="pinned" value={n.pinned ? "0" : "1"} /><button className={act}>{n.pinned ? "Unpin" : "Pin"}</button></form>
                  )}
                  <form action={noteDelete}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} /><ConfirmButton message="Delete this note?" className="rounded-md font-medium text-ink-soft hover:text-red-700">Delete</ConfirmButton></form>
                </span>
              </div>
              {n.body && (
                <details>
                  <summary className="list-none whitespace-pre-line [&::-webkit-details-marker]:hidden">{n.body}<span className="ml-2 text-xs font-medium text-blue">Edit</span></summary>
                  <form action={noteEdit} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={n.id} /><input type="hidden" name="path" value={path} />
                    <Textarea name="body" defaultValue={n.body} rows={3} aria-label="Edit note" />
                    <Button variant="secondary">Save changes</Button>
                  </form>
                </details>
              )}
              {n.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.attachments.map((a) => a.mediaType === "IMAGE" ? (
                    <a key={a.id} href={`/api/media/${a.id}/lg`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private media */}
                      <img src={`/api/media/${a.id}/sm`} alt="Note attachment" className="size-16 rounded-lg border border-line object-cover" />
                    </a>
                  ) : (
                    <a key={a.id} href={`/api/media/${a.id}/file`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-blue hover:bg-tint"><Paperclip className="size-3.5" aria-hidden />{a.filename ?? "File"}</a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm text-ink-soft">No notes yet.</p>}
    </Card>
  );
}
