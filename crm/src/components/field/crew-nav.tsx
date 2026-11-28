"use client";
// The crew frame's two links (Route, Time), marking the page you are on. Nothing here leads into the back office.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Route } from "lucide-react";

const LINKS = [
  { href: "/run", label: "Route", icon: Route, match: ["/run", "/stop"] },
  { href: "/time", label: "Time", icon: Clock, match: ["/time"] },
];

export function CrewNav() {
  const path = usePathname();
  return (
    <nav aria-label="Crew" className="flex items-center gap-1">
      {LINKS.map((l) => {
        const on = l.match.some((m) => path === m || path.startsWith(`${m}/`));
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold focus-visible:outline-sky ${on ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            <l.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />{l.label}
          </Link>
        );
      })}
    </nav>
  );
}
