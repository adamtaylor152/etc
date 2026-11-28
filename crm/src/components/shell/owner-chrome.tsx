import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, Home, MessageSquare, Snowflake, Users } from "lucide-react";
import { signOutAction } from "@/app/auth/go/actions";
import { ServiceWorker } from "@/components/sw-register";
import { db } from "@/server/db";
import { AppShell } from "./app-shell";

// Phone bottom bar: the five things you need in a cold driveway. Everything else is in the menu drawer.
const PHONE_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/snow", label: "Snow", icon: Snowflake },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/clients", label: "Clients", icon: Users },
];

/** The owner's app frame (sidebar, search, counts, phone bar). The caller has already checked the user is an owner. */
export async function OwnerChrome({ user, children }: { user: { businessId: string; email: string }; children: ReactNode }) {
  const [unread, toMatch] = await Promise.all([
    db.textMessage.count({ where: { businessId: user.businessId, direction: "IN", readAt: null } }),
    db.unmatchedPayment.count({ where: { businessId: user.businessId, status: "OPEN" } }),
  ]);
  return (
    <>
      <AppShell counts={{ unread, toMatch }} email={user.email} signOut={signOutAction}>{children}</AppShell>
      <ServiceWorker />
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden" aria-label="Quick">
        {PHONE_NAV.map((n) => (
          <Link key={n.href} href={n.href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-soft active:bg-tint">
            <n.icon className="size-5" aria-hidden />{n.label}{n.href === "/messages" && unread > 0 && ` (${unread})`}
          </Link>
        ))}
      </nav>
    </>
  );
}
