// "Select or create a client" (Jobber's first step for new work): search, pick, or make a new client.
import Link from "next/link";
import { Plus, Search, User } from "lucide-react";
import { db } from "@/server/db";
import { clientName } from "@/server/queries";
import { DetailHeader } from "./detail-header";

export async function ClientPick({ businessId, base, keep = {}, q, title }: { businessId: string; base: string; keep?: Record<string, string>; q?: string; title: string }) {
  const term = q?.trim();
  const clients = await db.client.findMany({
    where: { businessId, archivedAt: null, ...(term ? { OR: [{ firstName: { contains: term, mode: "insensitive" } }, { lastName: { contains: term, mode: "insensitive" } }, { companyName: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }, { properties: { some: { formatted: { contains: term, mode: "insensitive" } } } }] } : {}) },
    include: { properties: { where: { archivedAt: null }, take: 1, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } },
    orderBy: term ? { firstName: "asc" } : { createdAt: "desc" }, take: 30,
  });
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...keep, ...extra }).toString();
  return (
    <>
      <DetailHeader title={title} sub="Who is this for?" />
      <section className="max-w-2xl rounded-lg border border-line bg-white shadow-card">
        <form action={base} className="flex gap-2 border-b border-line p-3">
          {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-blue">
            <Search className="size-4 text-ink-soft" aria-hidden /><input name="q" defaultValue={term} autoFocus placeholder="Search clients by name, phone, email or address" aria-label="Search clients" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <Link href="/clients/new" className="inline-flex h-10 items-center gap-1 rounded-lg bg-blue px-3 text-sm font-semibold text-white"><Plus className="size-4" />New client</Link>
        </form>
        <ul className="divide-y divide-line">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`${base}?${qs({ client: c.id })}`} className="flex items-center gap-3 px-4 py-3 hover:bg-tint">
                <User className="size-4 text-ink-soft" aria-hidden />
                <span className="min-w-0"><span className="block font-semibold">{clientName(c)}</span><span className="block truncate text-xs text-ink-soft">{[c.phone, c.properties[0]?.formatted].filter(Boolean).join(" · ")}</span></span>
              </Link>
            </li>
          ))}
          {!clients.length && <li className="p-6 text-center text-sm text-ink-soft">No clients match. <Link href="/clients/new" className="font-semibold text-blue">Create one</Link></li>}
        </ul>
      </section>
    </>
  );
}
