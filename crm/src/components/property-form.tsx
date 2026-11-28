// Add/edit a property: address (Places), label, community, access details.
import Link from "next/link";
import { propertySave } from "@/app/(owner)/client-actions";
import { AddressField } from "./address-field";
import { Button, Card, Field, Input, Notice, Textarea } from "./ui";

const heading = "font-display text-[0.95rem] font-semibold";
const group = "space-y-3 border-t border-line-soft pt-5";

export function PropertyForm({ clientId, p, mapsKey, communities, error }: {
  clientId: string; mapsKey?: string; communities: { code: string; name: string }[]; error?: string;
  p?: { id: string; formatted: string; label: string | null; communityCode: string | null; lat: number | null; lng: number | null; accessNotes: string | null; gateCode: string | null; petNotes: string | null; hazards: string | null; isDefault: boolean; routePriority: boolean; steps: number | null; sidewalkM: number | null; lawnSqM: number | null };
}) {
  return (
    <form action={propertySave} className="max-w-2xl">
      <input type="hidden" name="clientId" value={clientId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      {error && <Notice tone="bad">{error}</Notice>}
      <Card className="space-y-5">
        <section className="space-y-3">
          <h2 className={heading}>Address</h2>
          <AddressField mapsKey={mapsKey} communities={communities} defaults={p ?? {}} />
          <Field label="Label (optional)" hint="Helps when a client has more than one property"><Input name="label" defaultValue={p?.label ?? ""} placeholder="Rental, Cabin, Mom's place" /></Field>
        </section>
        <section className={group}>
          <h2 className={heading}>Access</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gate or door code"><Input name="gateCode" defaultValue={p?.gateCode ?? ""} /></Field>
            <Field label="Pets"><Input name="petNotes" defaultValue={p?.petNotes ?? ""} placeholder="Friendly lab in the yard" /></Field>
          </div>
          <Field label="Access notes"><Textarea name="accessNotes" rows={2} defaultValue={p?.accessNotes ?? ""} placeholder="Side gate, park on the street, shovel the back steps too" /></Field>
          <Field label="Hazards"><Input name="hazards" defaultValue={p?.hazards ?? ""} placeholder="Icy patch by the downspout" /></Field>
        </section>
        <section className={group}>
          <h2 className={heading}>Site measurements</h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Steps" hint="How many to clear"><Input name="steps" type="number" min={0} max={200} defaultValue={p?.steps ?? ""} className="tabular-nums" /></Field>
            <Field label="Sidewalk (m)" hint="Length the crew clears"><Input name="sidewalkM" type="number" min={0} max={2000} defaultValue={p?.sidewalkM ?? ""} className="tabular-nums" /></Field>
            <Field label="Lawn (m²)" hint="For yard-care quotes"><Input name="lawnSqM" type="number" min={0} max={100000} defaultValue={p?.lawnSqM ?? ""} className="tabular-nums" /></Field>
          </div>
        </section>
        <section className="border-t border-line-soft pt-5">
          <h2 className={`${heading} mb-1`}>Routing</h2>
          <div className="divide-y divide-line-soft">
            <label className="flex items-start gap-3 py-2.5 text-sm"><input type="checkbox" name="routePriority" defaultChecked={p?.routePriority} className="mt-0.5 size-4 shrink-0" /><span><span className="font-medium">Do first on the route</span><span className="block text-xs text-ink-soft">Seniors, medical needs, early commuters: goes to the front of its community.</span></span></label>
            <label className="flex items-start gap-3 py-2.5 text-sm max-sm:min-h-11 max-sm:items-center"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault} className="mt-0.5 size-4 shrink-0" /><span className="font-medium">Main property for this client</span></label>
          </div>
        </section>
        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-4">
          <Link href={`/clients/${clientId}`} className="mr-auto inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-ink-soft hover:text-navy">Cancel</Link>
          <Button>Save property</Button>
        </div>
      </Card>
    </form>
  );
}
