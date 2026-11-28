// Detail-page header (Jobber pattern): object type + status label, title, client/property line, primary action + More menu.
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

export function DetailHeader({ back, kind, status, title, sub, actions }: {
  back?: { href: string; label: string }; kind?: ReactNode; status?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="-ml-1 mb-2 inline-flex min-h-8 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-ink-soft hover:text-navy"><ChevronLeft className="size-4" aria-hidden />{back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {(kind || status) && <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-soft">{kind}{status}</div>}
          <h1 className="font-display text-[1.7rem] font-semibold leading-tight sm:text-[2rem]">{title}</h1>
          {sub && <div className="mt-1 max-w-[70ch] text-sm text-ink-soft">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
