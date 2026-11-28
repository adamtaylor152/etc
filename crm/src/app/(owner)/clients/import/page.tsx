// Bring a client list in from a spreadsheet (or another system's export).
import Link from "next/link";
import { Download } from "lucide-react";
import { DetailHeader } from "@/components/detail-header";
import { Flash } from "@/components/flash";
import { Button, Card, Notice } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { CLIENT_COLUMNS, MAX_IMPORT_ROWS } from "@/server/ops/client-import";
import { clientImport } from "../../client-actions";

export const metadata = { title: "Import clients" };

export default async function ImportClients({ searchParams }: PageProps<"/clients/import">) {
  await requireOwner();
  const sp = await searchParams;
  const n = (k: "created" | "skipped") => (typeof sp[k] === "string" ? Number(sp[k]) : null);
  const created = n("created"), skipped = n("skipped");
  const heading = "font-display text-[0.95rem] font-semibold";
  return (
    <>
      <DetailHeader back={{ href: "/clients", label: "Clients" }} title="Import clients" sub="Upload a CSV. People already in your list (same email or phone) are skipped, never changed." />
      <div className="max-w-2xl">
        <Flash error={sp.error} />
        {created != null && (
          <Notice tone="good">
            Added {created} client{created === 1 ? "" : "s"}.{skipped ? ` Skipped ${skipped} already in your list.` : ""} <Link href="/clients" className="font-semibold underline underline-offset-2">View clients</Link>
          </Notice>
        )}
        {typeof sp.problems === "string" && (
          <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
            <p className="font-semibold">Some rows need a look</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans">{sp.problems}</pre>
          </div>
        )}
        <Card>
          <form action={clientImport} className="space-y-5">
            <section>
              <h2 className={heading}>1. Get your file ready</h2>
              <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">Save your list as a CSV. The first row is column names. A single &quot;Name&quot; column works too; other columns are ignored. Up to {MAX_IMPORT_ROWS} rows.</p>
              <p className="mb-1.5 mt-3 text-xs font-medium text-ink-soft">Columns we read</p>
              <ul className="flex flex-wrap gap-1.5">{CLIENT_COLUMNS.map((col) => <li key={col} className="rounded-md border border-line bg-tint px-2 py-0.5 text-xs font-medium">{col}</li>)}</ul>
              <a href="/api/export/clients" className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-blue hover:text-blue-deep"><Download className="size-4" aria-hidden />Download your current list as a template</a>
            </section>
            <section className="border-t border-line-soft pt-5">
              <h2 className={heading}><label htmlFor="import-file">2. Choose the CSV file</label></h2>
              <input id="import-file" type="file" name="file" accept=".csv,text/csv" required
                className="mt-2 block w-full rounded-lg border border-dashed border-line bg-tint/40 p-3 text-sm text-ink-soft file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line file:bg-white file:px-4 file:text-sm file:font-semibold file:text-navy file:shadow-sm hover:border-ink-faint/60 hover:file:bg-tint" />
            </section>
            <div className="flex items-center justify-end gap-4 border-t border-line-soft pt-4">
              <Link href="/clients" className="inline-flex min-h-10 items-center rounded-lg px-1 text-sm font-semibold text-ink-soft hover:text-navy">Cancel</Link>
              <Button>Import clients</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
