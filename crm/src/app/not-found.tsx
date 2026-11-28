// Any address that isn't a page. Says so plainly and offers the two places people usually meant.
import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl bg-night p-6 text-white"><Logo className="text-4xl" /></div>
      <div className="mt-3 rounded-2xl border border-line bg-white p-6 shadow-card">
        <h1 className="font-display text-2xl font-semibold">That page isn&apos;t here</h1>
        <p className="mt-2 text-sm text-ink-soft">The link may be old, or the record was removed. Nothing is wrong with your account.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-deep">Go to today</Link>
          <Link href="/clients" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold shadow-sm hover:bg-tint">Find a client</Link>
        </div>
      </div>
    </main>
  );
}
