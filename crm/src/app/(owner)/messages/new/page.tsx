// Start a conversation: pick a client with a mobile number, or type any number.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { Flash } from "@/components/flash";
import { Button, Field, Input } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { toE164 } from "@/server/sms";
import { textStart } from "../../text-actions";

export default async function NewMessage({ searchParams }: PageProps<"/messages/new">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const clients = (await db.client.findMany({ where: { businessId: bid, archivedAt: null, phone: { not: null } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }))
    .filter((c) => toE164(c.phone));
  return (
    <section className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-line bg-white p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/messages" className="text-sm font-semibold text-blue md:hidden">‹ Back</Link>
        <h1 className="font-display text-xl font-bold">New message</h1>
      </div>
      <Flash error={typeof sp.error === "string" ? sp.error : undefined} />
      <form action={textStart} className="max-w-md space-y-4">
        <Field label="Client">
          <select name="clientId" className="min-h-11 w-full rounded-xl border border-line bg-white px-3">
            <option value="">Choose a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)} · {c.phone}</option>)}
          </select>
        </Field>
        <p className="text-center text-xs font-semibold uppercase text-ink-soft">or</p>
        <Field label="Phone number"><Input name="number" type="tel" inputMode="tel" placeholder="403-555-0101" /></Field>
        <Button>Open conversation</Button>
      </form>
    </section>
  );
}
