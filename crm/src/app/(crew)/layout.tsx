// The crew surface: pages a crew login may open (the route runner and their own time). Owners get their usual frame;
// crew get a bare one with no menu, search or counts, so nothing here links into the back office.
import Link from "next/link";
import { signOutAction } from "@/app/auth/go/actions";
import { OwnerChrome } from "@/components/shell/owner-chrome";
import { ServiceWorker } from "@/components/sw-register";
import { requireUser } from "@/server/auth";

export default async function CrewLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (user.role === "OWNER") return <OwnerChrome user={user}>{children}</OwnerChrome>;
  return (
    <>
      <header className="no-print flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2">
        <span className="flex items-center gap-4 text-sm font-semibold text-blue">
          <span className="whitespace-nowrap font-display text-lg font-bold text-navy">etc. crew</span>
          <Link href="/run">Route</Link>
          <Link href="/time">Time</Link>
        </span>
        <form action={signOutAction} className="flex min-w-0 items-center gap-3 whitespace-nowrap text-sm">
          <span className="truncate text-ink-soft">{user.email}</span>
          <button className="font-semibold text-blue">Sign out</button>
        </form>
      </header>
      <main className="p-4">{children}</main>
      <ServiceWorker />
    </>
  );
}
