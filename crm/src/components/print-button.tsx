"use client";
import { Printer } from "lucide-react";
import { btn } from "./ui";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className={btn("secondary")}><Printer className="-ml-0.5 size-4" strokeWidth={1.75} aria-hidden />{label}</button>;
}
