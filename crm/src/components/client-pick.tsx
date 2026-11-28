// "Select or create a client" (Jobber's first step for new work): search, pick, or make a new client.
import Link from "next/link";
import { ChevronRight, Plus, Search, User } from "lucide-react";
import { db } from "@/server/db";
import { clientName } from "@/server/queries";
import { DetailHeader } from "./detail-header";
import { ButtonLink, Empty } from "./ui";
import { prettyPhone } from "./phone";

export async function ClientPick({ businessId, base, keep = {}, q, title }: { businessId: string; base: string; keep?: Record<string, string>; q?: string; title: string }) {
  const term = q?.trim();
  const clients = await db.client.findMany({
    where: { businessId, archivedAt: null, ...(term ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { companyName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }, { properties: { some: { formatted: { contains: term, mode: "insensitive" } } } }] } : {}) },
    include: { properties: { where: { archivedAt: null }, take: 1, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
    orderBy: term ? { firstName: "asc" } : { createdAt: "desc" }, take: 30,
  });
  const list = base.replace(/\/new$/, ""); // "/invoices/new" -> back to "/invoices"
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...keep, ...extra }).toString();
  return (
    <>
      <DetailHeader back={{ href: list, label: list[1].toUpperCase() + list.slice(2) }} title={title} sub="Who is this for? Pick a client, or add a new one." />
      <section className="max-w-3xl rounded-xl border border-line bg-white shadow-card">
        <form action={base} role="search" className="flex flex-wrap gap-2 border-b border-line p-3">
          {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label className="flex min-h-11 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg border border-line bg-white px-3 hover:border-ink-faint/60 focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/20 sm:min-h-10">
            <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
            <input type="search" name="q" defaultValue={term} autoFocus enterKeyHint="search" placeholder="Name, phone, email or address" aria-label="Search clients by name, phone, email or address" className="min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none sm:text-sm" />
          </label>
          <ButtonLink href="/clients/new" className="max-sm:min-h-11"><Plus className="-ml-1 size-4" aria-hidden />New client</ButtonLink>
        </form>
        {clients.length > 0 && <p className="border-b border-line-soft px-4 py-2 text-xs font-medium text-ink-soft">{term ? (clients.length === 30 ? "First 30 matches" : `${clients.length} match${clients.length === 1 ? "" : "es"}`) : "Most recent clients"}</p>}
        <ul className="divide-y divide-line-soft">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`${base}?${qs({ client: c.id })}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-tint">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-ink-soft" aria-hidden><User className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{clientName(c)}</span><span className="block truncate text-xs text-ink-soft">{[prettyPhone(c.phone), c.properties[0]?.formatted].filter(Boolean).join(" · ") || "No phone or address yet"}</span></span>
                <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {!clients.length && (
          <div className="p-4">
            <Empty action={<ButtonLink href="/clients/new" variant="primary"><Plus className="-ml-1 size-4" aria-hidden />New client</ButtonLink>}>No clients match. Check the spelling, or add them as a new client.</Empty>
          </div>
        )}
      </section>
    </>
  );
}
