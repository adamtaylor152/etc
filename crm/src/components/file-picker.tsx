"use client";
// A file input that looks like the rest of the app: a secondary button with an icon, and the chosen file's name beside
// it. The real <input type="file"> is still in the form (same name, same submit), only visually hidden.
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { btn } from "./ui";

export function FilePicker({ label, icon, hint, className = "", onChange, ...p }: Omit<ComponentProps<"input">, "type" | "className"> & {
  label: string; icon?: ReactNode; /** Shown beside the button until a file is chosen. */ hint?: ReactNode; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  // A form clears its inputs after it is sent (and on reset): clear the name with it.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const clear = () => setNames([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-2.5 ${className}`}>
      <label className={btn("secondary", "shrink-0 cursor-pointer px-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue has-disabled:cursor-default has-disabled:opacity-50")}>
        {icon ?? <Paperclip className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />}{label}
        <input {...p} ref={input} type="file" className="sr-only"
          onChange={(e) => { setNames([...(e.target.files ?? [])].map((f) => f.name)); onChange?.(e); }} />
      </label>
      <span aria-live="polite" className="min-w-0 truncate text-xs text-ink-soft" title={names.length > 1 ? names.join(", ") : undefined}>
        {names.length === 0 ? hint : names.length === 1 ? names[0] : `${names.length} files chosen`}
      </span>
    </span>
  );
}
