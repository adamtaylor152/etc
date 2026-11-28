// Start a conversation: pick a client with a mobile number, or type any number.
import { requireOwner } from "@/server/auth";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Flash } from "@/components/flash";
import { Button, Field, Input, inputCls } from "@/components/ui";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { toE164 } from "@/server/sms";
import { textStart } from "../../text-actions";
import { prettyPhone } from "@/components/phone";

export default async function NewMessage({ searchParams }: PageProps<"/messages/new">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const clients = (await db.client.findMany({ where: { businessId: bid, archivedAt: null, phone: { not: null } }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }))
    .filter((c) => toE164(c.phone));
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <header className="flex min-h-[3.75rem] items-center gap-2 border-b border-line px-2 py-2 sm:px-4">
        <Link href="/messages" className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-tint hover:text-navy md:hidden" aria-label="Back to conversations"><ChevronLeft className="size-5" aria-hidden /></Link>
        <h1 className="font-display text-lg font-semibold">New message</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-md"><Flash error={typeof sp.error === "string" ? sp.error : undefined} /></div>
        <form action={textStart} className="max-w-md space-y-4">
          <Field label="Client" hint={clients.length ? "Clients with a mobile number on file." : "No clients have a mobile number on file yet. Type a number below."}>
            <select name="clientId" className={`${inputCls} min-h-11`}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)} · {prettyPhone(c.phone)}</option>)}
            </select>
          </Field>
          <p className="flex items-center gap-3 text-xs font-medium text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">or text a number that isn&apos;t a client yet</p>
          <Field label="Phone number"><Input name="number" type="tel" inputMode="tel" placeholder="403-555-0101" className="min-h-11 tabular-nums" /></Field>
          <Button className="min-h-11">Open conversation</Button>
        </form>
      </div>
    </section>
  );
}
