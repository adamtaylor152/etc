// "How did we do?" 1–5 stars. 4–5 -> thank you + Google review button; 1–3 -> private feedback to the owners.
import { Star } from "lucide-react";
import { Cta, cta, Done, LinkProblem, PageTitle } from "@/components/public/kit";
import { Card, inputCls } from "@/components/ui";
import { db } from "@/server/db";
import { peekToken } from "@/server/tokens";
import { rateAction, feedbackAction } from "./actions";

export const metadata = { title: { absolute: "How did we do? · etc." }, robots: { index: false } };

const WORDS = ["Poor", "Fair", "OK", "Good", "Great"];

export default async function Review({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const t = await peekToken(db, token, ["REVIEW"]);
  if (!t.ok || !t.token.redirectPath) return <LinkProblem title="This link has expired">Thanks for thinking of us. Give us a call any time.</LinkProblem>;
  const r = await db.reviewRequest.findUnique({ where: { id: t.token.redirectPath } });
  if (!r) return <Done title="Thanks." />;
  const biz = await db.business.findUniqueOrThrow({ where: { id: r.businessId } });
  const c = await db.client.findUniqueOrThrow({ where: { id: r.clientId } });

  if (r.feedback || sp.sent) return <Done title={`Thank you, ${c.firstName}.`}>We read every word, and we&apos;ll be in touch to make it right.</Done>;
  if (r.rating && r.rating >= 4) return (
    <>
      <PageTitle title={`Thank you, ${c.firstName}`} sub="Would you share that on Google? It helps neighbours find a local business, and it means a lot to us." />
      {biz.googleReviewUrl && <a href={`/r/${token}/go`} className={cta()}>Leave a Google review</a>}
    </>
  );
  if (r.rating) return (
    <>
      <PageTitle title="Sorry we missed the mark" sub="What could we have done better? This goes straight to the owners, not online." />
      <Card>
        <form action={feedbackAction} className="space-y-3">
          <input type="hidden" name="t" value={token} />
          <label className="block"><span className="mb-1 block font-semibold">Your feedback</span><textarea name="feedback" required rows={5} maxLength={3000} className={inputCls} /></label>
          <Cta>Send to the owners</Cta>
        </form>
      </Card>
    </>
  );
  return (
    <>
      <PageTitle title={`Hi ${c.firstName}, how did we do?`} sub="Tap a star: one is poor, five is great." />
      <Card>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <form key={n} action={rateAction}>
              <input type="hidden" name="t" value={token} /><input type="hidden" name="rating" value={n} />
              <button aria-label={`${n} star${n === 1 ? "" : "s"}: ${WORDS[n - 1].toLowerCase()}`} className="group flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white hover:border-amber-400 hover:bg-amber-50">
                <Star className="size-7 text-amber-500 group-hover:fill-amber-400" strokeWidth={1.75} aria-hidden />
                <span className="text-sm font-semibold tabular-nums">{n}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 flex justify-between text-sm text-ink-soft" aria-hidden><span>Poor</span><span>Great</span></p>
      </Card>
    </>
  );
}
