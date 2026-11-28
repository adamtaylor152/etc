// Sales pipeline: every open request and quote as a card in the column its status puts it in. Cards move by doing the
// normal thing (send the quote, the client approves, ...), so there is nothing to drag and nothing to keep in sync.
import Link from "next/link";
import { ButtonLink, Empty, PageHeader } from "@/components/ui";
import { requireOwner } from "@/server/auth";
import { db } from "@/server/db";
import { cad } from "@/server/money";
import { clientName } from "@/server/queries";
import { age, quoteStage, requestStage, STAGES, type Stage } from "@/server/status/pipeline";

export const metadata = { title: "Pipeline" };
// A dot beside each column name: the same semantic colours as status badges (the name carries the meaning).
const DOT: Record<Stage, string> = { new: "bg-blue", assessment: "bg-blue", quoting: "bg-ink-faint", sent: "bg-amber-500", changes: "bg-red-600", won: "bg-emerald-600", lost: "bg-ink-faint" };
const CLOSED: Stage[] = ["won", "lost"];
type Card = { key: string; href: string; kind: string; title: string; client: string; cents: number | null; since: Date; note?: string | null };

/** Server-side "now" maths kept out of the component body. */
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }

export default async function Pipeline() {
  const user = await requireOwner();
  const recent = daysAgo(30); // closed cards (won / lost) drop off after 30 days
  const [requests, quotes] = await Promise.all([
    db.request.findMany({
      where: { businessId: user.businessId, OR: [{ status: { in: ["NEW", "ASSESSMENT_SCHEDULED"] } }, { status: "CONVERTED", convertedAt: { gte: recent } }, { status: "ARCHIVED", archivedAt: { gte: recent } }] },
      include: { client: true, _count: { select: { quotes: true, jobs: true } } }, orderBy: { createdAt: "desc" }, take: 500,
    }),
    db.quote.findMany({
      where: { businessId: user.businessId, OR: [{ status: { in: ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"] } }, { status: { in: ["APPROVED", "CONVERTED"] }, approvedAt: { gte: recent } }, { status: "DECLINED", declinedAt: { gte: recent } }, { status: "ARCHIVED", archivedAt: { gte: recent }, approvedAt: null }] },
      include: { client: true }, orderBy: { createdAt: "desc" }, take: 500,
    }),
  ]);
  const cols = new Map<Stage, Card[]>(STAGES.map(([k]) => [k, []]));
  for (const r of requests) {
    const stage = requestStage({ status: r.status, quotes: r._count.quotes, jobs: r._count.jobs });
    if (stage) cols.get(stage)!.push({ key: r.id, href: `/requests/${r.id}`, kind: `Request #${r.number}`, title: r.title, client: clientName(r.client), cents: null, since: r.archivedAt ?? r.convertedAt ?? r.assessmentAt ?? r.createdAt, note: stage === "lost" ? r.lostReason : r.estimateText });
  }
  for (const q of quotes) {
    cols.get(quoteStage(q.status))!.push({ key: q.id, href: `/quotes/${q.id}`, kind: `Quote #${q.number}`, title: q.title ?? "Quote", client: clientName(q.client), cents: q.totalCents, since: q.declinedAt ?? q.archivedAt ?? q.approvedAt ?? q.changesRequestedAt ?? q.lastSentAt ?? q.sentAt ?? q.createdAt, note: q.status === "DECLINED" ? q.declineReason : null });
  }
  const sum = (cs: Card[]) => cs.reduce((n, c) => n + (c.cents ?? 0), 0);
  const won = cols.get("won")!, lost = cols.get("lost")!;
  const open = STAGES.filter(([k]) => !CLOSED.includes(k)).flatMap(([k]) => cols.get(k)!);
  return (
    <>
      <PageHeader title="Pipeline"
        sub={<>Open work to win, plus what closed in the last 30 days{won.length + lost.length ? `: ${Math.round((100 * won.length) / (won.length + lost.length))}% won` : ""}. Cards move on their own as you send quotes and clients answer.</>}
        actions={<><ButtonLink href="/requests/new">New request</ButtonLink><ButtonLink href="/quotes/new" variant="primary">New quote</ButtonLink></>} />
      {!open.length && !won.length && !lost.length ? (
        <Empty action={<ButtonLink href="/quotes/new" variant="primary">New quote</ButtonLink>}>Nothing in the pipeline yet. New requests and quotes show up here as soon as they exist.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft"><span className="font-semibold text-navy tabular-nums">{open.length}</span> open{sum(open) > 0 && <> worth <span className="font-semibold text-navy tabular-nums">{cad(sum(open))}</span> in quotes</>}<span className="lg:hidden"> · swipe sideways for more stages</span></p>
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:snap-none lg:px-0">
            {STAGES.map(([k, label]) => {
              const cards = cols.get(k)!;
              const closed = CLOSED.includes(k);
              return (
                <section key={k} aria-label={`${label}: ${cards.length}`} className={`flex w-[17.5rem] max-w-[82vw] shrink-0 snap-start flex-col rounded-xl border ${closed ? "border-dashed border-line bg-transparent" : "border-line-soft bg-line-soft/70"}`}>
                  <header className="px-3 pb-1 pt-3">
                    <h2 className="flex items-center gap-2 font-display text-[0.95rem] font-semibold">
                      <span className={`size-2 shrink-0 rounded-full ${DOT[k]}`} aria-hidden />
                      <span className={`truncate ${closed ? "text-ink-soft" : ""}`}>{label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 font-sans text-xs font-medium text-ink-soft tabular-nums">{cards.length}</span>
                    </h2>
                    <p className="mt-0.5 pl-4 text-xs text-ink-soft tabular-nums">{sum(cards) > 0 ? <><span className={`font-semibold ${closed ? "" : "text-navy"}`}>{cad(sum(cards))}</span> in quotes</> : cards.length ? "No quote totals yet" : " "}</p>
                  </header>
                  <ul className="space-y-2 p-2">
                    {cards.map((c) => (
                      <li key={c.key}>
                        <Link href={c.href} className={`block rounded-lg border px-3 py-2.5 text-sm ${closed ? "border-line-soft bg-white/70 hover:border-line hover:bg-white" : "border-line bg-white shadow-card hover:border-ink-faint/60 hover:shadow-sm"}`}>
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`min-w-0 truncate font-semibold ${closed ? "text-ink-soft" : ""}`}>{c.client}</span>
                            {c.cents != null && c.cents > 0 && <span className={`shrink-0 font-semibold tabular-nums ${closed ? "text-ink-soft" : ""}`}>{cad(c.cents)}</span>}
                          </span>
                          <span className="block truncate text-ink-soft">{c.title}</span>
                          {c.note && <span className="mt-0.5 block truncate text-xs text-ink-soft">{c.note}</span>}
                          <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink-soft">
                            <span className="tabular-nums">{c.kind}</span>
                            <span className="rounded bg-tint px-1.5 py-px tabular-nums" title="How long it has sat in this stage">{age(c.since)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                    {!cards.length && <li className="px-1 py-6 text-center text-xs text-ink-soft">Nothing here</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
