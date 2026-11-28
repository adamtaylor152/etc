// Route runner: my stops today, one at a time. Add it to the home screen for storm days.
import Link from "next/link";
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
  return (
    <>
      <div className="mx-auto mb-3 flex max-w-lg items-center justify-between">
        <h1 className="font-display text-2xl font-bold">My route</h1>
        <DatePick date={date} who={who === "all" ? "all" : undefined} />
        {owner && <span className="flex gap-1 rounded-lg bg-white p-1 text-xs font-semibold shadow-card">
          <Link href={`/run?date=${date}`} className={`rounded-md px-2 py-1 ${who !== "all" ? "bg-navy text-white" : "text-ink-soft"}`}>Mine</Link>
          <Link href={`/run?date=${date}&who=all`} className={`rounded-md px-2 py-1 ${who === "all" ? "bg-navy text-white" : "text-ink-soft"}`}>Everyone</Link>
        </span>}
      </div>
      {stops.length ? <RouteRunner date={`${date}-${who}`} initial={stops} /> : <p className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center text-sm text-ink-soft">Nothing on your route today. {owner && <Link href="/routes" className="font-semibold text-blue">See all routes</Link>}</p>}
    </>
  );
}
