import Link from "next/link";
import { CalendarDays, Home, MessageSquare, Snowflake, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { ServiceWorker } from "@/components/sw-register";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { signOutAction } from "../auth/go/actions";

// Phone bottom bar: the five things you need in a cold driveway. Everything else is in the menu drawer.
const PHONE_NAV = [
  { href: "/", label: "Today", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/snow", label: "Snow", icon: Snowflake },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/clients", label: "Clients", icon: Users },
];

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const user = await requireOwner();
  const [unread, toMatch] = await Promise.all([
    db.textMessage.count({ where: { businessId: user.businessId, direction: "IN", readAt: null } }),
    db.unmatchedPayment.count({ where: { businessId: user.businessId, status: "OPEN" } }),
  ]);
  return (
    <>
      <AppShell counts={{ unread, toMatch }} email={user.email} signOut={signOutAction}>{children}</AppShell>
      <ServiceWorker />
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white sm:hidden" aria-label="Quick">
        {PHONE_NAV.map((n) => (
          <Link key={n.href} href={n.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-ink-soft">
            <n.icon className="size-5" aria-hidden />{n.label}{n.href === "/messages" && unread > 0 && ` (${unread})`}
          </Link>
        ))}
      </nav>
    </>
  );
}
