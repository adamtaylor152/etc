// Add/edit a property: address (Places), label, community, access details.
import { propertySave } from "@/app/(owner)/client-actions";
import { AddressField } from "./address-field";
import { Field, Input, Textarea } from "./ui";

export function PropertyForm({ clientId, p, mapsKey, communities, error }: {
  clientId: string; mapsKey?: string; communities: { code: string; name: string }[]; error?: string;
  p?: { id: string; formatted: string; label: string | null; communityCode: string | null; lat: number | null; lng: number | null; accessNotes: string | null; gateCode: string | null; petNotes: string | null; hazards: string | null; isDefault: boolean; routePriority: boolean };
}) {
  return (
    <form action={propertySave} className="max-w-2xl space-y-4 rounded-lg border border-line bg-white p-5 shadow-card">
      <input type="hidden" name="clientId" value={clientId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
      <div><span className="mb-1 block text-sm font-semibold">Address</span><AddressField mapsKey={mapsKey} communities={communities} defaults={p ?? {}} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label (optional)"><Input name="label" defaultValue={p?.label ?? ""} placeholder="Rental, Cabin, Mom's place" /></Field>
        <Field label="Gate / door code"><Input name="gateCode" defaultValue={p?.gateCode ?? ""} /></Field>
      </div>
      <Field label="Access notes"><Textarea name="accessNotes" rows={2} defaultValue={p?.accessNotes ?? ""} placeholder="Side gate, park on the street, shovel the back steps too" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pets"><Input name="petNotes" defaultValue={p?.petNotes ?? ""} placeholder="Friendly lab in the yard" /></Field>
        <Field label="Hazards"><Input name="hazards" defaultValue={p?.hazards ?? ""} placeholder="Icy patch by the downspout" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="routePriority" defaultChecked={p?.routePriority} className="size-4" />Do first on the route <span className="text-ink-soft">(seniors, medical needs, early commuters: goes to the front of its community)</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault} className="size-4" />Main property for this client</label>
      <button className="inline-flex min-h-10 items-center rounded-lg bg-blue px-5 text-sm font-semibold text-white">Save property</button>
    </form>
  );
}
