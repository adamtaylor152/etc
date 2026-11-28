"use client";
// Phone-friendly photo upload. Resizes in the browser (2000px, JPEG 0.8) before sending: faster on cell data,
// and re-encoding through a canvas drops EXIF, so the customer's GPS location never leaves their phone.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.8));
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: the server converts it
  }
}

const MAX = 30; // ponytail: one request per photo, so this only bounds a single pick; the servers cap totals

export function PhotoUploader({ endpoint, fields = {}, label, camera = true, done, geo = false }: {
  endpoint: string; fields?: Record<string, string>; label: string; camera?: boolean; done?: string; geo?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let pos: GeolocationPosition | null = null;
    if (geo) pos = await new Promise((r) => navigator.geolocation?.getCurrentPosition(r, () => r(null), { timeout: 5000, maximumAge: 120_000 }) ?? r(null));
    const list = [...files].slice(0, MAX);
    let ok = 0;
    for (const [i, f] of list.entries()) {
      setStatus(`Uploading ${i + 1} of ${list.length}…`);
      const body = new FormData();
      Object.entries(fields).forEach(([k, v]) => body.append(k, v));
      if (pos) { body.append("lat", String(pos.coords.latitude)); body.append("lng", String(pos.coords.longitude)); }
      body.append("file", await shrink(f), f.name.replace(/\.\w+$/, "") + ".jpg");
      const res = await fetch(endpoint, { method: "POST", body }).catch(() => null);
      if (res?.ok) ok++;
      else {
        const err = await res?.json().catch(() => null);
        setStatus(err?.error ?? "Upload failed. Check your connection and try again.");
        setBusy(false);
        router.refresh();
        return;
      }
    }
    setStatus((done ?? `${ok} photo${ok === 1 ? "" : "s"} added`) + (files.length > MAX ? ` (the first ${MAX}; add the rest in another batch)` : ""));
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-dashed border-blue px-4 font-semibold text-blue ${busy ? "opacity-50" : ""}`}>
        <span aria-hidden>📷</span> {busy ? "Uploading…" : label}
        <input ref={input} type="file" accept="image/*" multiple disabled={busy} className="sr-only"
          {...(camera ? { capture: "environment" as const } : {})} onChange={(e) => upload(e.target.files)} />
      </label>
      {status && <p className="mt-2 text-center text-sm text-ink-soft" aria-live="polite">{status}</p>}
    </div>
  );
}
