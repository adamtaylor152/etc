// The crew surface: pages a crew login may open (the route runner and their own time). Owners get their usual frame;
// crew get a bare one with no menu, search or counts, so nothing here links into the back office.
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth/go/actions";
import { CrewNav } from "@/components/field/crew-nav";
import { OwnerChrome } from "@/components/shell/owner-chrome";
import { ServiceWorker } from "@/components/sw-register";
import { Logo } from "@/components/ui";
import { requireUser } from "@/server/auth";

export default async function CrewLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (user.role === "OWNER") return <OwnerChrome user={user}>{children}</OwnerChrome>;
  return (
    <>
      <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-white/10 bg-night px-4 py-1.5 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap"><Logo className="text-xl" /><span className="text-xs font-medium text-white/70">crew</span></span>
          <CrewNav />
        </div>
        <form action={signOutAction} className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm">
          <span className="hidden truncate text-white/70 sm:inline">{user.name || user.email}</span>
          <button className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-white/85 hover:bg-white/10 hover:text-white focus-visible:outline-sky"><LogOut className="size-4" aria-hidden />Sign out</button>
        </form>
      </header>
      <main id="main" className="px-4 pb-10 pt-4">{children}</main>
      <ServiceWorker />
    </>
  );
}
