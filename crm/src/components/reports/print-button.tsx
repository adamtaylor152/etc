"use client";
// Opens the browser's print dialog: reports print as a clean page (see the print rules on the report page).
import { Printer } from "lucide-react";
import { btn } from "@/components/ui";

export function PrintReportButton({ label = "Print" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className={btn("secondary")}><Printer className="size-4" strokeWidth={1.75} aria-hidden />{label}</button>;
}
