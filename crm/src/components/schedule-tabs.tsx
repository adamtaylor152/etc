// Sub-navigation for the schedule pages.
import Link from "next/link";

const TABS = [["/schedule", "Calendar"], ["/schedule/team", "Team & map"], ["/schedule/find", "Find a time"], ["/schedule/bulk", "Bulk changes"]] as const;

export function ScheduleTabs({ active }: { active: (typeof TABS)[number][0] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Schedule</h1>
      <nav className="flex gap-1 rounded-lg bg-white p-1 shadow-card">
        {TABS.map(([href, label]) => <Link key={href} href={href} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${active === href ? "bg-navy text-white" : "text-ink-soft hover:text-navy"}`}>{label}</Link>)}
      </nav>
    </div>
  );
}
