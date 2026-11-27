// Every email the app sends. The outbox stores {template, props}; links that sign someone in are minted
// at send time so raw tokens never sit in the database.
import type { ReactElement } from "react";
import { BookingConfirmation, OwnerNewBooking, type BookingEmailProps } from "@/emails/booking";
import { OwnerLogin } from "@/emails/login";
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

const bookingConfirmation: Template<BookingEmailProps> = {
  subject: () => "We got your booking. Thanks from Silas & etc.!",
  async render(p) {
    return <BookingConfirmation {...p} />;
  },
};

export const templates = {
  "owner.login": ownerLogin,
  "owner.new_booking": ownerNewBooking,
  "booking.confirmation": bookingConfirmation,
} as const;

export type TemplateName = keyof typeof templates;
export type PropsOf<T extends TemplateName> = Parameters<(typeof templates)[T]["subject"]>[0];
