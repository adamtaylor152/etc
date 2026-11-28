// Every email the app sends. The outbox stores {template, props}; links that sign someone in are minted
// at send time so raw tokens never sit in the database.
import type { ReactElement } from "react";
import { BookingConfirmation, OwnerNewBooking, type BookingEmailProps } from "@/emails/booking";
import { OwnerLogin } from "@/emails/login";
import { InvoiceSent, OwnerPaymentReceived, PaymentReceipt, type InvoiceEmailData } from "@/emails/invoice";
import { HubLink, OwnerNotice, PlanRenewal, QuoteApproved, QuoteSent, type QuoteEmailData } from "@/emails/quote";
import { DailyDigest, ReviewRequest, VisitScheduled } from "@/emails/schedule";
import { OnMyWay, OwnerSnowAlert, StormHeadsUp } from "@/emails/snow";
import { OwnerPhotosUploaded, PhotoUploadRequest, VisitDone } from "@/emails/visit";
import { invoiceTotals } from "../billing/invoice";
import { money } from "../money";
import { stripeEnabled } from "../stripe";
import { dateOnly, prettyDate, todayLocal, toDbDate } from "../dates";
import { signedMediaPath } from "../media";
import { clientName } from "../queries";
import { db } from "../db";
import { CampaignEmail } from "@/emails/campaign";
import { clickUrl, openPixelUrl, unsubscribeUrl, type Block } from "../ops/campaigns";
import { env } from "../env";
import { mintToken } from "../tokens";

type Ctx = { businessId: string; to: string };
type Template<P> = { subject: (p: P) => string; render: (p: P, ctx: Ctx) => Promise<ReactElement> };

const ownerLogin: Template<{ userId: string; next: string }> = {
  subject: () => "Sign in to etc. CRM",
  async render(p, ctx) {
    const raw = await mintToken(db, ctx.businessId, "LOGIN", { userId: p.userId, redirectPath: p.next });
    return <OwnerLogin url={`${env.appUrl}/auth/go?t=${raw}`} />;
  },
};

type OwnerBooking = { requestId: string; badge: string; booking: BookingEmailProps };
const ownerNewBooking: Template<OwnerBooking> = {
  subject: (p) => `New booking #${p.booking.number}: ${p.booking.name}, ${p.booking.services.join(", ")}`,
  async render(p, ctx) {
    const path = `/requests/${p.requestId}`;
    // Owners get a personal sign-in link; anyone else on the Cc list gets a link that needs a login.
    const user = await db.user.findFirst({ where: { businessId: ctx.businessId, email: ctx.to.toLowerCase(), active: true } });
    const crmUrl = user
      ? `${env.appUrl}/auth/go?t=${await mintToken(db, ctx.businessId, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: path })}`
      : `${env.appUrl}${path}`;
    return <OwnerNewBooking {...p.booking} crmUrl={crmUrl} badge={p.badge} />;
  },
};

type Confirmation = BookingEmailProps & { requestId?: string; wantsPhotos?: boolean };
const bookingConfirmation: Template<Confirmation> = {
  subject: () => "We got your booking. Thanks from Silas & etc.!",
  async render(p, ctx) {
    // Something needs quoting: give them a link to send photos (minted now, so no raw token is stored).
    const uploadUrl = p.wantsPhotos && p.requestId
      ? `${env.appUrl}/u/${await mintToken(db, ctx.businessId, "PHOTO_UPLOAD", { requestId: p.requestId })}` : undefined;
    return <BookingConfirmation {...p} uploadUrl={uploadUrl} />;
  },
};

const ownerPhotosUploaded: Template<{ requestId: string; number: number }> = {
  subject: (p) => `Photos added to request #${p.number}`,
  async render(p, ctx) {
    const user = await db.user.findFirst({ where: { businessId: ctx.businessId, email: ctx.to.toLowerCase(), active: true } });
    const path = `/requests/${p.requestId}`;
    const url = user ? `${env.appUrl}/auth/go?t=${await mintToken(db, ctx.businessId, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: path })}` : `${env.appUrl}${path}`;
    return <OwnerPhotosUploaded number={p.number} url={url} />;
  },
};

const visitDone: Template<{ visitId: string }> = {
  subject: () => "All done! Before & after photos from etc.",
  async render(p, ctx) {
    const v = await db.visit.findUniqueOrThrow({
      where: { id: p.visitId },
      include: { job: { include: { client: true } }, property: true, attachments: { where: { deletedAt: null, sharedWithClient: true, kind: { in: ["BEFORE", "AFTER"] } }, orderBy: { createdAt: "asc" } } },
    });
    const report = await mintToken(db, ctx.businessId, "VISIT_REPORT", { visitId: v.id, clientId: v.job.clientId });
    // Billed per visit: the invoice made at completion rides along in the same email.
    const inv = await db.invoice.findFirst({ where: { businessId: ctx.businessId, status: "AWAITING_PAYMENT", lineItems: { some: { visitId: v.id } } } });
    const payUrl = inv ? `${env.appUrl}/i/${await mintToken(db, ctx.businessId, "INVOICE", { invoiceId: inv.id, clientId: inv.clientId })}` : undefined;
    return (
      <VisitDone
        name={clientName(v.job.client)} address={v.property.formatted} when={prettyDate(v.completedAt ? todayLocal(v.completedAt) : dateOnly(v.scheduledDate))}
        what={v.job.kind === "SNOW_PLAN" || v.job.title.startsWith("Snow") ? "Snow clearing" : v.job.title} depthCm={v.depthCm}
        photos={v.attachments.map((a) => ({ kind: a.kind as "BEFORE" | "AFTER", url: env.appUrl + signedMediaPath(a.id, "md") }))}
        reportUrl={`${env.appUrl}/v/${report}`} site={env.siteUrl} phone={env.phone}
        payUrl={payUrl} amount={inv ? money(inv.totalCents - inv.amountPaidCents) : undefined}
      />
    );
  },
};

const photoUploadRequest: Template<{ requestId: string; name: string; services: string[] }> = {
  subject: () => "Send us a few photos for your quote",
  async render(p, ctx) {
    const raw = await mintToken(db, ctx.businessId, "PHOTO_UPLOAD", { requestId: p.requestId });
    return <PhotoUploadRequest name={p.name} services={p.services} url={`${env.appUrl}/u/${raw}`} site={env.siteUrl} phone={env.phone} />;
  },
};

async function invoiceData(invoiceId: string, businessId: string): Promise<InvoiceEmailData> {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  const biz = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const t = invoiceTotals([inv.subtotalCents], inv.discountCents, biz);
  const raw = await mintToken(db, businessId, "INVOICE", { invoiceId: inv.id, clientId: inv.clientId });
  return {
    name: clientName(inv.client), number: inv.number, subject: inv.subject ?? "Services", issued: prettyDate(dateOnly(inv.issuedOn) ?? todayLocal()),
    due: prettyDate(dateOnly(inv.dueOn) ?? todayLocal()),
    lines: inv.lineItems.map((l) => ({ name: Number(l.quantity) !== 1 ? `${l.name} × ${Number(l.quantity)}` : l.name, date: prettyDate(dateOnly(l.serviceDate)), amount: money(l.totalCents) })),
    total: money(inv.totalCents), paid: inv.amountPaidCents ? money(inv.amountPaidCents) : null, balance: money(Math.max(0, inv.totalCents - inv.amountPaidCents)),
    taxNote: biz.taxRegistered ? (t.taxIncluded ? `Includes ${biz.taxName} of ${money(inv.taxCents)}` : `${biz.taxName} ${money(inv.taxCents)} included in total`) + (biz.taxNumber ? ` · ${biz.taxName} #${biz.taxNumber}` : "") : null,
    payUrl: `${env.appUrl}/i/${raw}`, etransferEmail: biz.etransferEmail || env.etransferEmail, etransferRef: inv.etransferRef,
    cardEnabled: stripeEnabled(), site: env.siteUrl, phone: env.phone,
  };
}

const invoiceSent: Template<{ invoiceId: string }> = {
  subject: () => "Your invoice from etc.",
  async render(p, ctx) { return <InvoiceSent d={await invoiceData(p.invoiceId, ctx.businessId)} />; },
};

const invoiceReminder: Template<{ invoiceId: string; n: 1 | 2 }> = {
  subject: (p) => (p.n === 1 ? "Friendly reminder: your etc. invoice" : "Second reminder: your etc. invoice"),
  async render(p, ctx) { return <InvoiceSent d={await invoiceData(p.invoiceId, ctx.businessId)} reminder={p.n} />; },
};

const METHOD: Record<string, string> = { CASH: "cash", ETRANSFER: "e-Transfer", CARD: "card", CHEQUE: "cheque", OTHER: "payment" };
const paymentReceipt: Template<{ paymentId: string }> = {
  subject: () => "Receipt from etc. Thank you!",
  async render(p, ctx) {
    const pay = await db.payment.findUniqueOrThrow({ where: { id: p.paymentId }, include: { invoice: true } });
    return (
      <PaymentReceipt d={await invoiceData(pay.invoiceId, ctx.businessId)} amount={money(pay.amountCents)} method={METHOD[pay.method]}
        when={prettyDate(todayLocal(pay.receivedAt))} paidInFull={pay.invoice.amountPaidCents >= pay.invoice.totalCents} />
    );
  },
};

const ownerPaymentReceived: Template<{ paymentId: string }> = {
  subject: () => "Payment received",
  async render(p, ctx) {
    const pay = await db.payment.findUniqueOrThrow({ where: { id: p.paymentId }, include: { invoice: true, client: true } });
    const user = await db.user.findFirst({ where: { businessId: ctx.businessId, email: ctx.to.toLowerCase(), active: true } });
    const path = `/invoices/${pay.invoiceId}`;
    const url = user ? `${env.appUrl}/auth/go?t=${await mintToken(db, ctx.businessId, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: path })}` : `${env.appUrl}${path}`;
    return <OwnerPaymentReceived name={clientName(pay.client)} amount={money(pay.amountCents)} number={pay.invoice.number} url={url} />;
  },
};

const visitOnMyWay: Template<{ visitId: string }> = {
  subject: () => "The etc. crew is on the way",
  async render(p) {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true } });
    return <OnMyWay name={clientName(v.job.client)} address={v.property.formatted} site={env.siteUrl} phone={env.phone} />;
  },
};

const stormHeadsUp: Template<{ visitId: string }> = {
  subject: () => "Snow day: you're on our route",
  async render(p) {
    const v = await db.visit.findUniqueOrThrow({ where: { id: p.visitId }, include: { job: { include: { client: true } }, property: true, snowEvent: true } });
    return <StormHeadsUp name={clientName(v.job.client)} address={v.property.formatted} cm={v.snowEvent?.measuredCm ?? null} site={env.siteUrl} phone={env.phone} />;
  },
};

const ownerSnowAlert: Template<{ days: { label: string; cm: number }[]; plans: number }> = {
  subject: (p) => `Snow coming: ${p.plans} plan${p.plans === 1 ? "" : "s"} would trigger`,
  async render(p, ctx) {
    const user = await db.user.findFirst({ where: { businessId: ctx.businessId, email: ctx.to.toLowerCase(), active: true } });
    const url = user ? `${env.appUrl}/auth/go?t=${await mintToken(db, ctx.businessId, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: "/snow" })}` : `${env.appUrl}/snow`;
    return <OwnerSnowAlert days={p.days} plans={p.plans} url={url} />;
  },
};

async function quoteData(quoteId: string, businessId: string): Promise<QuoteEmailData> {
  const q = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } } });
  const raw = await mintToken(db, businessId, "QUOTE", { quoteId: q.id, clientId: q.clientId });
  return {
    name: clientName(q.client), number: q.number, title: q.title ?? "Your quote", message: q.message, validUntil: q.validUntil ? prettyDate(dateOnly(q.validUntil)) : null,
    total: money(q.totalCents), lines: q.lineItems.map((l) => ({ name: Number(l.quantity) !== 1 ? `${l.name} × ${Number(l.quantity)}` : l.name, amount: money(l.totalCents), optional: l.isOptional })),
    url: `${env.appUrl}/q/${raw}`, site: env.siteUrl, phone: env.phone,
  };
}

const quoteSent: Template<{ quoteId: string }> = {
  subject: () => "Your quote from etc.",
  async render(p, ctx) { return <QuoteSent d={await quoteData(p.quoteId, ctx.businessId)} />; },
};
const quoteFollowUp: Template<{ quoteId: string }> = {
  subject: () => "Any questions about your etc. quote?",
  async render(p, ctx) { return <QuoteSent d={await quoteData(p.quoteId, ctx.businessId)} followUp />; },
};
const quoteApproved: Template<{ quoteId: string }> = {
  subject: () => "Quote approved. Thanks from etc.!",
  async render(p, ctx) { return <QuoteApproved d={await quoteData(p.quoteId, ctx.businessId)} />; },
};

const ownerNotice: Template<{ title: string; body: string; path: string }> = {
  subject: (p) => p.title,
  async render(p, ctx) {
    const user = await db.user.findFirst({ where: { businessId: ctx.businessId, email: ctx.to.toLowerCase(), active: true } });
    const url = user ? `${env.appUrl}/auth/go?t=${await mintToken(db, ctx.businessId, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: p.path })}` : `${env.appUrl}${p.path}`;
    return <OwnerNotice title={p.title} body={p.body} url={url} />;
  },
};

const hubLink: Template<{ clientId: string }> = {
  subject: () => "Your etc. page (visits, photos, invoices)",
  async render(p, ctx) {
    const c = await db.client.findUniqueOrThrow({ where: { id: p.clientId } });
    const raw = await mintToken(db, ctx.businessId, "CLIENT_HUB", { clientId: c.id });
    return <HubLink name={clientName(c)} url={`${env.appUrl}/hub/${raw}`} site={env.siteUrl} phone={env.phone} />;
  },
};

async function scheduledEmail(visitId: string, reminder: boolean) {
  const v = await db.visit.findUniqueOrThrow({ where: { id: visitId }, include: { job: { include: { client: true } }, property: true } });
  return <VisitScheduled name={clientName(v.job.client)} what={v.job.title} date={prettyDate(dateOnly(v.scheduledDate))} address={v.property.formatted} reminder={reminder} site={env.siteUrl} phone={env.phone} />;
}
const visitScheduled: Template<{ visitId: string }> = { subject: () => "You're booked with etc.", render: (p) => scheduledEmail(p.visitId, false) };
const visitReminder: Template<{ visitId: string }> = { subject: () => "Reminder: etc. is coming tomorrow", render: (p) => scheduledEmail(p.visitId, true) };

const reviewRequest: Template<{ clientId: string; reviewId?: string }> = {
  subject: () => "How did we do?",
  async render(p, ctx) {
    const [c, biz] = await Promise.all([db.client.findUniqueOrThrow({ where: { id: p.clientId } }), db.business.findUniqueOrThrow({ where: { id: ctx.businessId } })]);
    // New flow: a rating page first (/r/...), which sends happy clients to Google and others to private feedback.
    const url = p.reviewId ? `${env.appUrl}/r/${await mintToken(db, ctx.businessId, "REVIEW", { clientId: c.id, redirectPath: p.reviewId })}` : biz.googleReviewUrl ?? env.siteUrl;
    return <ReviewRequest name={clientName(c)} url={url} site={env.siteUrl} phone={env.phone} />;
  },
};

const campaignEmail: Template<{ campaignId: string; recipientId: string; clientId: string }> = {
  subject: () => "", // set from the campaign when queued (see enqueue below)
  async render(p, ctx) {
    const [c, biz, client] = await Promise.all([
      db.campaign.findUniqueOrThrow({ where: { id: p.campaignId } }), db.business.findUniqueOrThrow({ where: { id: ctx.businessId } }),
      p.clientId ? db.client.findUnique({ where: { id: p.clientId } }) : null,
    ]);
    const real = p.recipientId !== "test";
    return <CampaignEmail title={c.subject ?? ""} name={client?.firstName ?? "there"} blocks={(c.blocks as Block[]).map((b) => (b.type === "button" && real ? { ...b, url: clickUrl(p.recipientId, b.url) } : b))}
      unsubscribe={client ? unsubscribeUrl(client.id) : `${env.appUrl}/unsubscribe/test`} address={biz.mailingAddress ?? ""} business={biz.name} pixel={real ? openPixelUrl(p.recipientId) : null} />;
  },
};

const ownerDailyDigest: Template<{ day: string }> = {
  subject: (p) => `Today at etc. (${prettyDate(p.day)})`,
  async render(p, ctx) {
    const bid = ctx.businessId;
    const [today, late, unbilled, owing, newRequests, failedEmails] = await Promise.all([
      db.visit.findMany({ where: { businessId: bid, scheduledDate: toDbDate(p.day), state: "SCHEDULED" }, include: { property: true, job: true } }),
      db.visit.count({ where: { businessId: bid, state: "SCHEDULED", scheduledDate: { lt: toDbDate(p.day) }, job: { closedAt: null } } }),
      db.visitCharge.aggregate({ where: { businessId: bid, invoiceLineItemId: null }, _sum: { totalCents: true } }),
      db.invoice.findMany({ where: { businessId: bid, status: "AWAITING_PAYMENT" }, select: { totalCents: true, amountPaidCents: true } }),
      db.request.count({ where: { businessId: bid, status: "NEW" } }),
      db.emailMessage.count({ where: { businessId: bid, status: "FAILED" } }),
    ]);
    const user = await db.user.findFirst({ where: { businessId: bid, email: ctx.to.toLowerCase(), active: true } });
    const url = user ? `${env.appUrl}/auth/go?t=${await mintToken(db, bid, "OWNER_DEEP_LINK", { userId: user.id, redirectPath: "/" })}` : env.appUrl;
    return <DailyDigest d={{
      day: prettyDate(p.day), today: today.map((v) => ({ address: v.property.formatted, what: v.job.title })), late,
      unbilled: money(unbilled._sum.totalCents ?? 0), owing: money(owing.reduce((a, i) => a + i.totalCents - i.amountPaidCents, 0)), newRequests, failedEmails, url,
    }} />;
  },
};

const planRenewal: Template<{ clientId: string; seasonId: string }> = {
  subject: () => "Keep your every-snowfall plan?",
  async render(p, ctx) {
    const [c, season, last] = await Promise.all([
      db.client.findUniqueOrThrow({ where: { id: p.clientId } }), db.season.findUniqueOrThrow({ where: { id: p.seasonId } }),
      db.job.findFirst({ where: { clientId: p.clientId, kind: "SNOW_PLAN" }, orderBy: { createdAt: "desc" } }),
    ]);
    const raw = await mintToken(db, ctx.businessId, "CLIENT_HUB", { clientId: c.id });
    return <PlanRenewal name={clientName(c)} season={season.name} price={money(last?.pricePerPushCents ?? 3000)} url={`${env.appUrl}/hub/${raw}`} site={env.siteUrl} phone={env.phone} />;
  },
};

export const templates = {
  "owner.login": ownerLogin,
  "owner.new_booking": ownerNewBooking,
  "booking.confirmation": bookingConfirmation,
  "owner.photos_uploaded": ownerPhotosUploaded,
  "visit.done": visitDone,
  "photo_upload.request": photoUploadRequest,
  "invoice.sent": invoiceSent,
  "invoice.reminder": invoiceReminder,
  "payment.receipt": paymentReceipt,
  "owner.payment_received": ownerPaymentReceived,
  "visit.on_my_way": visitOnMyWay,
  "storm.heads_up": stormHeadsUp,
  "owner.snow_alert": ownerSnowAlert,
  "quote.sent": quoteSent,
  "quote.follow_up": quoteFollowUp,
  "quote.approved": quoteApproved,
  "owner.notice": ownerNotice,
  "campaign.email": campaignEmail,
  "hub.link": hubLink,
  "visit.scheduled": visitScheduled,
  "visit.reminder": visitReminder,
  "review.request": reviewRequest,
  "owner.daily_digest": ownerDailyDigest,
  "plan.renewal": planRenewal,
} as const;

export type TemplateName = keyof typeof templates;
export type PropsOf<T extends TemplateName> = Parameters<(typeof templates)[T]["subject"]>[0];
