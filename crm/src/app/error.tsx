"use client";
// Something broke while building a page. Says what to do next; the details go to the server log, not the screen.
import { useEffect } from "react";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-md p-6 pt-16">
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <h1 className="font-display text-2xl font-semibold">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm text-ink-soft">Nothing you entered was lost unless you were in the middle of saving. Try again; if it keeps happening, the rest of the app still works.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => retry()} className="inline-flex min-h-10 items-center rounded-lg bg-blue px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-deep">Try again</button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point after an error */}
          <a href="/" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold shadow-sm hover:bg-tint">Go to today</a>
        </div>
      </div>
    </div>
  );
}
