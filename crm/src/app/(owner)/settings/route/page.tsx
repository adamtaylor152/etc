// Route settings: the order routes visit communities in, and how long a stop takes (for ETAs).
import { requireOwner } from "@/server/auth";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { ReorderList } from "@/components/reorder-list";
import { Saved } from "@/components/settings/fields";
import { Button, Card, Empty, Field, Input } from "@/components/ui";
import { business, businessId, db } from "@/server/db";
import { env } from "@/server/env";
import { parseSettings } from "@/server/settings";
import { saveCommunityOrder, saveRouteSettings } from "../actions";

export const metadata = { title: "Route settings" };

export default async function RouteSettings({ searchParams }: PageProps<"/settings/route">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const settings = parseSettings((await business()).settings);
  const area = await db.serviceCommunity.findMany({ where: { businessId: bid, active: true }, include: { community: true }, orderBy: [{ sortOrder: "asc" }, { communityCode: "asc" }] });
  return (
    <>
      <DetailHeader back={{ href: "/settings", label: "Settings" }} title="Route" sub="Routes visit communities in this order; inside each one, “do first” properties come first, then the rest by drive time." />
      <Flash error={sp.error} />
      <Saved when={!!sp.saved} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Community order">
          <p className="mb-2 max-w-[70ch] text-sm text-ink-soft"><span className="max-sm:hidden">Drag the handle or tap the arrows</span><span className="sm:hidden">Use the arrows</span>, then save. The route for every day follows this straight away; press Auto-order on the Route page to re-plan the stops inside each community.</p>
          {area.length === 0 && <Empty>No communities in your service area yet.</Empty>}
          <ReorderList action={saveCommunityOrder} saves={[{ label: "Save order", scope: "order" }]}
            items={area.map((a) => ({ id: a.communityCode, node: <p className="flex min-h-11 items-center py-2 text-sm font-semibold"><span className="reorder-n mr-3 inline-block w-6 text-right font-medium tabular-nums text-ink-soft" />{a.community.name}</p> }))} />
        </Card>
        <Card title="Estimated times">
          <form action={saveRouteSettings} className="space-y-3">
            <Field label="Minutes at a stop" hint="Added to the driving time for ETAs, route totals and splitting a route between people. About 12 for a snow stop."><Input name="serviceMinutes" type="number" min={1} max={240} defaultValue={settings.serviceMinutes} className="max-w-28 tabular-nums" /></Field>
            <Button>Save stop time</Button>
          </form>
          <p className="mt-3 text-xs text-ink-soft">Drive times: {env.routingUrl ? "worked out along real roads." : "straight-line estimates at 30 km/h. Real road times aren't set up yet; ask whoever runs your hosting to turn them on."} Each person&apos;s start and end points are on Settings › Team.</p>
        </Card>
      </div>
    </>
  );
}
