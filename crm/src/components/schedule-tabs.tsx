// Page header + sub-navigation shared by the schedule pages.
import type { ReactNode } from "react";
import { PageHeader, Tabs } from "./ui";

const TABS = [["/schedule", "Calendar"], ["/schedule/team", "Team & map"], ["/schedule/find", "Find a time"], ["/schedule/bulk", "Bulk changes"]] as const;

export function ScheduleTabs({ active, sub, actions }: { active: (typeof TABS)[number][0]; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <PageHeader title="Schedule" sub={sub} actions={actions} />
      <Tabs items={TABS.map(([href, label]) => ({ href, label }))} active={TABS.find(([href]) => href === active)![1]} />
    </>
  );
}
