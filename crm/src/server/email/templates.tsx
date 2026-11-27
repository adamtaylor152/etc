// Every email the app sends. The outbox stores {template, props}; links that sign someone in are minted
// at send time so raw tokens never sit in the database.
import type { ReactElement } from "react";
import { BookingConfirmation, OwnerNewBooking, type BookingEmailProps } from "@/emails/booking";
import { OwnerLogin } from "@/emails/login";
import { OwnerPhotosUploaded, PhotoUploadRequest, VisitDone } from "@/emails/visit";
import { dateOnly, prettyDate, todayLocal } from "../dates";
import { signedMediaPath } from "../media";
import { clientName } from "../queries";
import { db } from "../db";
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
    return (
      <VisitDone
        name={clientName(v.job.client)} address={v.property.formatted} when={prettyDate(v.completedAt ? todayLocal(v.completedAt) : dateOnly(v.scheduledDate))}
        what={v.job.kind === "SNOW_PLAN" || v.job.title.startsWith("Snow") ? "Snow clearing" : v.job.title} depthCm={v.depthCm}
        photos={v.attachments.map((a) => ({ kind: a.kind as "BEFORE" | "AFTER", url: env.appUrl + signedMediaPath(a.id, "md") }))}
        reportUrl={`${env.appUrl}/v/${report}`} site={env.siteUrl} phone={env.phone}
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

export const templates = {
  "owner.login": ownerLogin,
  "owner.new_booking": ownerNewBooking,
  "booking.confirmation": bookingConfirmation,
  "owner.photos_uploaded": ownerPhotosUploaded,
  "visit.done": visitDone,
  "photo_upload.request": photoUploadRequest,
} as const;

export type TemplateName = keyof typeof templates;
export type PropsOf<T extends TemplateName> = Parameters<(typeof templates)[T]["subject"]>[0];
