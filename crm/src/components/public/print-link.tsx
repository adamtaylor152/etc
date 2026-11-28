"use client";
// "Print or save as PDF" on a client page: a quiet, thumb-sized button that opens the browser's print sheet.
import { Printer } from "lucide-react";
import { tap } from "./kit";

export function PrintLink({ label = "Print or save as PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className={tap()}><Printer className="size-4" strokeWidth={1.75} aria-hidden />{label}</button>;
}
