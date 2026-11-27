"use client";
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="h-8 rounded-lg bg-navy px-3 text-sm font-semibold text-white">{label}</button>;
}
