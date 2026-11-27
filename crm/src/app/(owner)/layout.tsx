import Link from "next/link";
import { Logo } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { signOutAction } from "../auth/go/actions";

const NAV = [
  { href: "/", label: "Today", icon: "☀", phone: true },
  { href: "/routes", label: "Route", icon: "➜", phone: true },
  { href: "/snow", label: "Snow", icon: "❄", phone: true },
  { href: "/schedule", label: "Schedule", icon: "▦", phone: false },
  { href: "/requests", label: "Requests", icon: "✉", phone: false },
  { href: "/jobs", label: "Jobs", icon: "✓", phone: true },
  { href: "/clients", label: "Clients", icon: "☺", phone: true },
  { href: "/invoices", label: "Invoices", icon: "$", phone: false },
  { href: "/settings", label: "Settings", icon: "⚙", phone: false },
];

export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const user = await requireOwner();
  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="no-print sticky top-0 z-20 bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/"><Logo /></Link>
          <nav className="hidden gap-1 overflow-x-auto sm:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">{n.label}</Link>)}
          </nav>
          <form action={signOutAction} className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/60 md:inline">{user.email}</span>
            <button className="rounded-full px-3 py-1.5 font-semibold text-white/80 hover:bg-white/10">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
      {/* Bottom nav on phones: big targets for gloves */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white sm:hidden">
        {NAV.filter((n) => n.phone).map((n) => (
          <Link key={n.href} href={n.href} className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-ink-soft">
            <span className="text-lg leading-none" aria-hidden>{n.icon}</span>{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
