// Route runner: my stops today, one at a time. Add it to the home screen for storm days.
// Night presentation: this page is used before dawn, so it (and only it) sits on the dark frame colour. Crew phones get
// the whole page dark; an owner at a desk, under the light top bar, gets the same thing as one contained dark panel.
import Link from "next/link";
import { Clock } from "lucide-react";
import { DatePick } from "@/components/auto-submit";
import { RouteRunner } from "@/components/route-runner";
import { requireUser } from "@/server/auth";
import { todayLocal } from "@/server/dates";
import { runStops } from "@/server/runner";

export const metadata = { title: "Route runner" };

export default async function Run({ searchParams }: PageProps<"/run">) {
  const sp = await searchParams;
  const user = await requireUser();
  const owner = user.role === "OWNER";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const who = sp.who === "all" && owner ? "all" : user.id;
  const stops = await runStops(user.businessId, date, who);
  const seg = (on: boolean) => `inline-flex min-h-9 max-sm:min-h-11 items-center rounded-md px-3 text-sm font-semibold focus-visible:outline-sky ${on ? "bg-white text-night" : "text-white/75 hover:text-white"}`;
  return (
    <div data-night className={`text-white ${owner ? "lg:mx-auto lg:max-w-5xl lg:rounded-2xl lg:bg-night lg:p-8 lg:shadow-lift" : ""}`}>
      {/* The dark backdrop covers the whole page behind the frame's content, whichever frame (crew or owner) is around it. */}
      <div aria-hidden className={`pointer-events-none fixed inset-0 -z-10 bg-night ${owner ? "lg:hidden" : ""}`} />
      <div className="mx-auto mb-4 max-w-lg lg:max-w-none">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[1.7rem] font-semibold leading-tight">My route</h1>
          <Link href="/time" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-sky hover:text-white focus-visible:outline-sky"><Clock className="size-4" aria-hidden />Clock in / out</Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <DatePick date={date} who={who === "all" ? "all" : undefined} night />
          {owner && (
            <span className="flex gap-1 rounded-lg bg-white/10 p-1" role="group" aria-label="Whose stops">
              <Link href={`/run?date=${date}`} aria-current={who !== "all" ? "true" : undefined} className={seg(who !== "all")}>Mine</Link>
              <Link href={`/run?date=${date}&who=all`} aria-current={who === "all" ? "true" : undefined} className={seg(who === "all")}>Everyone</Link>
            </span>
          )}
        </div>
      </div>
      {stops.length ? <RouteRunner date={`${date}-${who}`} initial={stops} /> : (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-navy p-6 text-center">
          <p className="font-display text-xl font-semibold">Nothing on your route</p>
          <p className="mt-1 text-sm text-white/75">No stops for this day. Pick another day above, or check back when the office adds some.</p>
          {owner && <Link href="/routes" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-sky">See all routes</Link>}
        </div>
      )}
    </div>
  );
}
