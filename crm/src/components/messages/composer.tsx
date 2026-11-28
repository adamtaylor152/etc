"use client";
// Message box: Enter sends (Shift+Enter for a new line), up to 5 photos as MMS, segment counter.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, ListPlus, Send, X } from "lucide-react";
import { segments } from "@/server/segments";

const MAX = 5;
const tool = "grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-soft";

async function shrink(file: File): Promise<Blob> {
  // Resize in the browser: faster on cell data, and a canvas re-encode drops EXIF (GPS) before it leaves the phone.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.8));
  } catch {
    return file; // HEIC on a browser that can't decode it: the server converts it
  }
}

/** `disabled` says why texting is off for this conversation; `optedOut` shows it as a warning (the client texted STOP). */
export function Composer({ convoKey, disabled, optedOut = false, quick = [], rcs = false }: { convoKey: string; disabled?: string; optedOut?: boolean; quick?: string[]; rcs?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replies, setReplies] = useState<string[] | null>(null); // tap-to-reply buttons (RCS; a "Reply:" line on SMS)
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { // grow with the text, up to ~6 lines
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  if (disabled) {
    return (
      <div className="border-t border-line p-3">
        <p role="status" className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${optedOut ? "border-amber-200 bg-amber-50 text-amber-950" : "border-line bg-tint text-ink-soft"}`}>{disabled}</p>
      </div>
    );
  }

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    setFiles((cur) => [...cur, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX));
    if (input.current) input.current.value = "";
  };

  async function send() {
    if (busy || (!body.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("key", convoKey);
    form.append("body", body);
    for (const r of replies ?? []) if (r.trim()) form.append("reply", r);
    for (const f of files) form.append("file", await shrink(f.file), f.file.name.replace(/\.\w+$/, "") + ".jpg");
    const res = await fetch("/api/messages/send", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't send. Check your connection and try again.");
      router.refresh();
      return;
    }
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setBody("");
    setFiles([]);
    setReplies(null);
    router.refresh();
  }

  const seg = segments(body);
  const full = files.length >= MAX;
  return (
    <div className="border-t border-line bg-white p-2.5 sm:p-3">
      {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-900" role="alert">{error}</p>}
      {quick.length > 0 && !body && !files.length && (
        <div className="-mx-2.5 mb-2 flex gap-1.5 overflow-x-auto px-2.5 pb-0.5 [scrollbar-width:none] sm:-mx-3 sm:px-3" role="group" aria-label="Quick replies">
          {quick.map((q) => <button key={q} type="button" onClick={() => setBody(q)} title={q} className="min-h-11 shrink-0 rounded-full border border-line bg-white px-3.5 text-sm font-medium text-navy hover:border-ink-faint/60 hover:bg-tint sm:min-h-9">{q.length > 34 ? q.slice(0, 33) + "…" : q}</button>)}
        </div>
      )}
      {replies && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-ink-soft">Reply buttons</span>
          {replies.map((r, i) => (
            <input key={i} value={r} maxLength={25} placeholder={["Yes", "No thanks", "Call me", "Tomorrow"][i]} aria-label={`Reply button ${i + 1}`}
              onChange={(e) => setReplies(replies.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9 w-28 rounded-lg border border-line bg-white px-2.5 text-sm outline-none focus:border-blue focus:ring-2 focus:ring-blue/20" />
          ))}
          {replies.length < 4 && <button type="button" onClick={() => setReplies([...replies, ""])} className="min-h-9 rounded-lg px-2 text-sm font-medium text-blue hover:bg-blue/8">Add another</button>}
          <button type="button" onClick={() => setReplies(null)} className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-tint hover:text-navy" aria-label="Remove reply buttons"><X className="size-4" aria-hidden /></button>
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto pt-2">
          {files.map((f, i) => (
            <li key={f.url} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
              <img src={f.url} alt={`Photo ${i + 1} to send`} className="size-16 rounded-lg border border-line object-cover" />
              <button type="button" onClick={() => { URL.revokeObjectURL(f.url); setFiles(files.filter((_, j) => j !== i)); }}
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-line bg-white text-navy shadow-sm hover:bg-tint" aria-label={`Remove photo ${i + 1}`}><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label className={`${tool} ${full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-tint hover:text-navy"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue`} title={full ? `Up to ${MAX} photos per message` : "Add photos"}>
          <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden /><span className="sr-only">Add photos</span>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={full || busy} onChange={(e) => add(e.target.files)} />
        </label>
        <button type="button" onClick={() => setReplies(replies ?? ["", ""])} title="Add tap-to-reply buttons" aria-pressed={!!replies}
          className={`${tool} hidden sm:grid ${replies ? "border-blue/40 bg-blue/8 text-blue-deep" : "hover:bg-tint hover:text-navy"}`}>
          <ListPlus className="size-5" strokeWidth={1.75} aria-hidden /><span className="sr-only">Add reply buttons</span>
        </button>
        <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} rows={1} maxLength={1000} placeholder="Text message" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files); } }}
          className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-line bg-white px-3.5 py-2.5 text-base leading-snug outline-none hover:border-ink-faint/60 focus:border-blue focus:ring-2 focus:ring-blue/20 sm:text-[15px]" />
        <button type="button" onClick={send} disabled={busy || (!body.trim() && !files.length)} title={!body.trim() && !files.length ? "Type a message or add a photo first" : undefined}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-blue bg-blue px-4 text-sm font-semibold text-white shadow-sm hover:border-blue-deep hover:bg-blue-deep disabled:opacity-50 disabled:shadow-none"><Send className="size-4" aria-hidden />{busy ? "Sending…" : "Send"}</button>
      </div>
      <p className="mt-1.5 px-1 text-right text-xs tabular-nums text-ink-soft">
        {rcs && <span className="mr-2 font-medium text-navy">RCS when their phone supports it</span>}
        {files.length ? `${rcs ? "Photos" : "MMS"} · ${files.length} photo${files.length === 1 ? "" : "s"}` : seg.parts > 1 ? `${seg.parts} texts${seg.unicode ? " (emoji/accents use more room)" : ""}` : body ? `${body.length}/${seg.perPart}` : <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>}
      </p>
    </div>
  );
}
