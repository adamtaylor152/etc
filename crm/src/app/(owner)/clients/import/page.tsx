// Bring a client list in from a spreadsheet (or another system's export).
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, Card } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { CLIENT_COLUMNS, MAX_IMPORT_ROWS } from "@/server/ops/client-import";
import { clientImport } from "../../client-actions";

export const metadata = { title: "Import clients" };

export default async function ImportClients({ searchParams }: PageProps<"/clients/import">) {
  await requireOwner();
  const sp = await searchParams;
  const n = (k: "created" | "skipped") => (typeof sp[k] === "string" ? Number(sp[k]) : null);
  const created = n("created"), skipped = n("skipped");
  return (
    <>
      <DetailHeader back={{ href: "/clients", label: "Clients" }} title="Import clients" sub="Upload a CSV. People already in your list (same email or phone) are skipped, never changed." />
      <Flash error={sp.error} />
      {created != null && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          Added {created} client{created === 1 ? "" : "s"}.{skipped ? ` Skipped ${skipped} already in your list.` : ""}
        </p>
      )}
      {typeof sp.problems === "string" && <pre className="mb-4 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sp.problems}</pre>}
      <Card className="max-w-2xl">
        <form action={clientImport} className="space-y-4">
          <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
          <p className="text-sm text-ink-soft">The first row is column names. We read: {CLIENT_COLUMNS.join(", ")} (a single &quot;Name&quot; column works too). Other columns are ignored. Up to {MAX_IMPORT_ROWS} rows.</p>
          <div className="flex items-center gap-3">
            <Button>Import</Button>
            <a href="/api/export/clients" className="text-sm font-semibold text-blue">Download your current list as a template</a>
          </div>
        </form>
      </Card>
    </>
  );
}
