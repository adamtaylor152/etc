// Log a phone call by hand (calls to 403-656-8200 are also logged automatically from Telnyx).
import { DetailHeader } from "@/components/detail-header";
import { Field, Input, Textarea } from "@/components/ui";
import { toLocalInput } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { callLog } from "../../client-actions";

export const metadata = { title: "Log a call" };

export default async function NewCall({ searchParams }: PageProps<"/calls/new">) {
  const sp = await searchParams;
  const bid = await businessId();
  const pre = typeof sp.client === "string" ? sp.client : "";
  const clients = await db.client.findMany({ where: { businessId: bid, archivedAt: null }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 3000 });
  const back = typeof sp.back === "string" ? sp.back : pre ? `/clients/${pre}?tab=activity` : "/activity";
  return (
    <>
      <DetailHeader back={{ href: back, label: "Back" }} title="Log a call" sub="Calls to 403-656-8200 show up on their own within a few minutes. Use this for calls from your cell or to add notes." />
      <form action={callLog} className="max-w-xl space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
        <input type="hidden" name="back" value={back} />
        {typeof sp.error === "string" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{sp.error}</p>}
        <Field label="Client">
          <select name="clientId" defaultValue={pre} className="min-h-10 w-full rounded-lg border border-line bg-white px-3">
            <option value="">Not a client yet (enter the number below)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}{c.phone ? ` · ${c.phone}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Phone number (if not a client)"><Input name="number" type="tel" placeholder="403-555-0101" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Direction"><select name="direction" className="min-h-10 w-full rounded-lg border border-line bg-white px-3"><option value="IN">They called</option><option value="OUT">We called</option></select></Field>
          <Field label="Outcome"><select name="status" className="min-h-10 w-full rounded-lg border border-line bg-white px-3"><option value="answered">Talked</option><option value="voicemail">Voicemail</option><option value="missed">Missed</option><option value="no_answer">No answer</option></select></Field>
          <Field label="Minutes"><Input name="duration" type="number" min={0} step={1} inputMode="numeric" /></Field>
        </div>
        <Field label="When"><Input name="startedAt" type="datetime-local" defaultValue={toLocalInput(new Date())} /></Field>
        <Field label="Notes"><Textarea name="notes" rows={4} placeholder="What was it about? Next steps?" /></Field>
        <button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white">Save call</button>
      </form>
    </>
  );
}
