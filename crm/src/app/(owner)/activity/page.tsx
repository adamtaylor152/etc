// Account-wide activity: everything that happened, newest first, with who it was about.
import Link from "next/link";
import { Phone } from "lucide-react";
import { ActivityFeed, parseTypes } from "@/components/activity-feed";
import { activityFeed } from "@/server/activity";
import { businessId } from "@/server/db";

export const metadata = { title: "Activity" };

export default async function Activity({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const types = parseTypes(sp.types);
  const items = await activityFeed({ businessId: await businessId() }, { types, before: typeof sp.before === "string" ? new Date(sp.before) : undefined, limit: 80 });
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Activity</h1>
        <Link href="/calls/new?back=/activity" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-tint"><Phone className="size-4" />Log a call</Link>
      </div>
      <section className="rounded-lg border border-line bg-white p-4 shadow-card sm:p-5">
        <ActivityFeed items={items} base="/activity" types={types} showClient
          moreHref={items.length >= 80 ? `/activity?${typeof sp.types === "string" ? `types=${sp.types}&` : ""}before=${items.at(-1)!.at.toISOString()}` : undefined} />
      </section>
    </>
  );
}
