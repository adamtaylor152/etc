// Account-wide activity: everything that happened, newest first, with who it was about.
import { requireOwner } from "@/server/auth";
import { Phone } from "lucide-react";
import { ActivityFeed, parseTypes } from "@/components/activity-feed";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { activityFeed } from "@/server/activity";
import { businessId } from "@/server/db";

export const metadata = { title: "Activity" };

export default async function Activity({ searchParams }: PageProps<"/activity">) {
  await requireOwner();
  const sp = await searchParams;
  const types = parseTypes(sp.types);
  const items = await activityFeed({ businessId: await businessId() }, { types, before: typeof sp.before === "string" ? new Date(sp.before) : undefined, limit: 80 });
  return (
    <>
      <PageHeader title="Activity" sub="Everything that happened across the business, newest first."
        actions={<ButtonLink href="/calls/new?back=/activity"><Phone className="size-4" strokeWidth={1.75} aria-hidden />Log a call</ButtonLink>} />
      <Card>
        <ActivityFeed items={items} base="/activity" types={types} showClient
          moreHref={items.length >= 80 ? `/activity?${typeof sp.types === "string" ? `types=${sp.types}&` : ""}before=${items.at(-1)!.at.toISOString()}` : undefined} />
      </Card>
    </>
  );
}
