"use client";
// Logo and brand colour pickers (Settings › Messages) with a live sample of what a client sees: the top of an email
// with the logo, a button and a link in the chosen colour. The form fields are the same two as before: `logo`, `brandColor`.
import { useEffect, useState } from "react";
import { ImageUp } from "lucide-react";
import { FilePicker } from "@/components/file-picker";

export function BrandFields({ logoUrl, color, businessName }: { logoUrl: string | null; color: string; businessName: string }) {
  const [c, setC] = useState(color);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked); }, [picked]);
  const logo = picked ?? logoUrl;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-semibold">Logo</span>
          <FilePicker name="logo" accept="image/*" label={logoUrl ? "Replace logo" : "Choose a logo"} icon={<ImageUp className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />} className="flex"
            onChange={(e) => { const f = e.target.files?.[0]; setPicked(f ? URL.createObjectURL(f) : null); }} />
          <span className="mt-1 block text-xs text-ink-soft">PNG or JPG, wide rather than tall. It shows on a white background.</span>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Brand colour</span>
          <span className="flex items-center gap-3">
            <input type="color" name="brandColor" value={c} onChange={(e) => setC(e.target.value)} className="h-10 w-16 cursor-pointer rounded-lg border border-line bg-white p-1 max-sm:h-11" />
            <code className="text-sm tabular-nums text-ink-soft">{c}</code>
          </span>
          <span className="mt-1 block text-xs text-ink-soft">Buttons and links. Light colours are refused so white button text stays readable.</span>
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Sample</p>
        <div className="rounded-lg bg-tint p-3">
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex min-h-16 items-center border-b border-line-soft px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private media or a local preview blob */}
              {logo ? <img src={logo} alt="Your logo" className="h-10 w-auto max-w-44 object-contain" />
                : <span className="rounded bg-navy px-3 py-1 font-display text-2xl font-bold text-white">etc<span className="text-sky">.</span></span>}
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <p>Hi Sam, your quote from {businessName} is ready.</p>
              <span className="inline-flex min-h-10 items-center rounded-lg px-4 font-semibold text-white" style={{ background: c }}>View your quote</span>
              <p className="text-xs text-ink-soft">Questions? <span className="font-semibold underline" style={{ color: c }}>Reply to this email</span>.</p>
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-soft">A made-up email. {picked ? "This logo and colour apply once you save." : "The colour applies once you save."}</p>
      </div>
    </div>
  );
}
