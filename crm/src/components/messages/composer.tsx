"use client";
// Message box: Enter sends (Shift+Enter for a new line), up to 5 photos as MMS, segment counter.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { segments } from "@/server/segments";

const MAX = 5;

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

export function Composer({ convoKey, disabled, quick = [] }: { convoKey: string; disabled?: string; quick?: string[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { // grow with the text, up to ~6 lines
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  if (disabled) return <p className="border-t border-line p-4 text-center text-sm text-ink-soft">{disabled}</p>;

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
    router.refresh();
  }

  const seg = segments(body);
  return (
    <div className="border-t border-line bg-white p-2 sm:p-3">
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {quick.length > 0 && !body && !files.length && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {quick.map((q) => <button key={q} type="button" onClick={() => setBody(q)} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-tint">{q.length > 34 ? q.slice(0, 33) + "…" : q}</button>)}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <li key={f.url} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
              <img src={f.url} alt="" className="size-16 rounded-lg object-cover" />
              <button type="button" onClick={() => { URL.revokeObjectURL(f.url); setFiles(files.filter((_, j) => j !== i)); }}
                className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-navy text-xs text-white" aria-label="Remove photo">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <label className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-line text-lg ${files.length >= MAX ? "opacity-40" : "hover:bg-tint"}`} title="Add photos (MMS)">
          <span aria-hidden>📷</span><span className="sr-only">Add photos</span>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={files.length >= MAX || busy} onChange={(e) => add(e.target.files)} />
        </label>
        <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} rows={1} maxLength={1000} placeholder="Text message" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); add(e.clipboardData.files); } }}
          className="min-h-11 flex-1 resize-none rounded-2xl border border-line px-4 py-2.5 text-[15px] leading-snug" />
        <button type="button" onClick={send} disabled={busy || (!body.trim() && !files.length)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-blue px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Sending…" : "Send"}</button>
      </div>
      <p className="mt-1 px-1 text-right text-[11px] text-ink-soft">
        {files.length ? `MMS · ${files.length} photo${files.length === 1 ? "" : "s"}` : seg.parts > 1 ? `${seg.parts} texts${seg.unicode ? " (emoji/accents use more room)" : ""}` : body ? `${body.length}/${seg.perPart}` : "Enter to send · Shift+Enter for a new line"}
      </p>
    </div>
  );
}
