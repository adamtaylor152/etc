"use client";
// A value the client has to carry into their banking app (the e-Transfer address, the ETC- reference): shown large,
// selectable in one tap (`select-all`), with a Copy button that says when it worked.
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* no clipboard (old browser, http): the value is still select-all */ }
  }
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink-soft">{label}</p>
      <div className="flex items-stretch gap-2">
        <p className={`flex min-h-[52px] min-w-0 flex-1 select-all items-center break-all rounded-lg border border-line bg-tint px-3.5 py-2 font-semibold leading-snug tabular-nums ${value.length > 24 ? "text-[0.95rem]" : "text-lg"}`}>{value}</p>
        <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex min-h-[52px] w-[5.75rem] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[0.95rem] font-semibold shadow-sm hover:border-ink-faint/60 hover:bg-tint">
          {copied ? <Check className="size-4 text-emerald-600" strokeWidth={1.75} aria-hidden /> : <Copy className="size-4" strokeWidth={1.75} aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}
