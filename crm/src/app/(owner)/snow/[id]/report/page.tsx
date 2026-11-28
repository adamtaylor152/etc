// Printable proof-of-service report for a storm (keep for slip-and-fall claims).
import { requireOwner } from "@/server/auth";
import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { DetailHeader } from "@/components/detail-header";
import { Empty, btn } from "@/components/ui";
import { businessId } from "@/server/db";
import { stormReport } from "@/server/stormReport";

export const metadata = { title: "Storm report" };

export default async function StormReport({ params }: PageProps<"/snow/[id]/report">) {
  await requireOwner();
  const { id } = await params;
  const data = await stormReport(await businessId(), id).catch(() => null);
  if (!data) notFound();
  const { ev, rows } = data;
  const th = "py-2 pr-3 text-left align-bottom text-xs font-medium text-ink-soft";
  const words = (s: string) => { const t = s.toLowerCase().replaceAll("_", " "); return t.charAt(0).toUpperCase() + t.slice(1); };
  return (
    <>
      <div className="no-print">
        <DetailHeader back={{ href: `/snow/${id}`, label: ev.name }} kind="Proof-of-service report" title={ev.name}
          sub="Keep this for slip-and-fall claims: every stop with its times, depth, ice melt, photos and the phone's location."
          actions={<>
            <a href={`/api/export/storm/${id}`} className={btn("secondary")}><Download className="size-4" aria-hidden />Download CSV</a>
            <a href="javascript:print()" className={btn("primary")}><Printer className="size-4" aria-hidden />Print or save PDF</a>
          </>} />
      </div>
      <div className="rounded-xl border border-line bg-white p-4 text-sm shadow-card sm:p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <h2 className="font-display text-xl font-semibold">Proof of service · {ev.name}</h2>
        <p className="mt-1 tabular-nums text-ink-soft">{ev.season.name} · {ev.forecastCm != null ? `forecast ${ev.forecastCm} cm` : "no forecast depth"} · {ev.measuredCm != null ? `measured ${ev.measuredCm} cm` : "depth not measured"} · {ev.pushCount} push{ev.pushCount > 1 ? "es" : ""} · status {ev.status.toLowerCase()}</p>
        {rows.length ? (
          <div className="mt-4 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[46rem] border-collapse print:min-w-0">
              <thead><tr className="border-b border-navy/30">
                <th scope="col" className={`${th} text-right`}>#</th><th scope="col" className={th}>Address</th><th scope="col" className={`${th} text-right`}>Push</th><th scope="col" className={th}>Result</th><th scope="col" className={th}>Arrived</th><th scope="col" className={th}>Done / skipped</th><th scope="col" className={`${th} text-right`}>Depth</th><th scope="col" className={th}>Melt</th><th scope="col" className={`${th} pr-0`}>GPS</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="break-inside-avoid border-b border-line-soft align-top">
                    <td className="py-2.5 pr-3 text-right text-ink-soft">{i + 1}</td>
                    <td className="py-2.5 pr-3"><span className="font-semibold">{r.address}</span><div className="text-xs text-ink-soft">{r.client} · {r.community}</div>
                      {r.photos.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- private media, owner session */}
                          {r.photos.slice(0, 4).map((p) => <img key={p.id} src={`/api/media/${p.id}/sm`} alt={`${words(p.kind)} photo`} className="h-14 w-20 rounded border border-line object-cover" />)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{r.push}</td>
                    <td className="py-2.5 pr-3">{words(r.state)}{r.skipReason && <div className="text-xs text-ink-soft">{words(r.skipReason)}{r.skipNote && `: ${r.skipNote}`}</div>}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3">{r.arrived}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3">{r.completed || r.skipped}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right">{r.depthCm != null ? `${r.depthCm} cm` : ""}</td>
                    <td className="py-2.5 pr-3">{r.iceMelt}</td>
                    <td className="py-2.5 text-xs">{r.gps && <a className="font-medium text-blue hover:text-blue-deep" href={`https://www.google.com/maps/search/?api=1&query=${r.gps}`}>{r.gps}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="mt-4"><Empty>No visits on this storm, so there is nothing to report yet.</Empty></div>}
        <p className="mt-4 max-w-[70ch] text-xs text-ink-soft">Times in Calgary time. GPS is the crew phone&apos;s location when the visit was marked done. Generated by etc. CRM.</p>
      </div>
    </>
  );
}
