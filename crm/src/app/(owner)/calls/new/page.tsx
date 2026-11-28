// Log a phone call by hand (calls to 403-656-8200 are also logged automatically from Telnyx).
import { requireOwner } from "@/server/auth";
import { ClientSelect } from "@/components/client-select";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, ButtonLink, Card, Field, Input, inputCls, Textarea } from "@/components/ui";
import { toLocalInput } from "@/server/dates";
import { businessId, db } from "@/server/db";
import { clientName } from "@/server/queries";
import { callLog } from "../../client-actions";

export const metadata = { title: "Log a call" };

export default async function NewCall({ searchParams }: PageProps<"/calls/new">) {
  await requireOwner();
  const sp = await searchParams;
  const bid = await businessId();
  const pre = typeof sp.client === "string" ? sp.client : "";
  const client = pre ? await db.client.findFirst({ where: { id: pre, businessId: bid } }) : null;
  const back = typeof sp.back === "string" ? sp.back : pre ? `/clients/${pre}?tab=activity` : "/activity";
  return (
    <>
      <DetailHeader back={{ href: back, label: "Back" }} title="Log a call" sub="Calls to 403-656-8200 show up on their own within a few minutes. Use this for calls from your cell or to add notes." />
      <div className="max-w-xl">
        <Flash error={sp.error} />
        <Card>
          <form action={callLog} className="space-y-3">
            <input type="hidden" name="back" value={back} />
            <Field label="Client">
              <ClientSelect initial={client && { id: client.id, name: clientName(client) }} none="Not a client yet (enter the number below)" />
            </Field>
            <Field label="Phone number (if not a client)"><Input name="number" type="tel" autoComplete="off" placeholder="403-555-0101" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Direction"><select name="direction" className={inputCls}><option value="IN">They called</option><option value="OUT">We called</option></select></Field>
              <Field label="Outcome"><select name="status" className={inputCls}><option value="answered">Talked</option><option value="voicemail">Voicemail</option><option value="missed">Missed</option><option value="no_answer">No answer</option></select></Field>
              <Field label="Minutes"><Input name="duration" type="number" min={0} step={1} inputMode="numeric" /></Field>
            </div>
            <Field label="When"><Input name="startedAt" type="datetime-local" defaultValue={toLocalInput(new Date())} /></Field>
            <Field label="Notes"><Textarea name="notes" rows={4} placeholder="What was it about? Next steps?" /></Field>
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <Button>Save call</Button>
              <ButtonLink href={back}>Cancel</ButtonLink>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
