// A made-up version of every client email the owner can reword (Settings › Messages): what Preview and
// "Send me a test" show, and what the tests render. No database, no real links.
import type { ReactElement } from "react";
import { BookingConfirmation } from "@/emails/booking";
import { AutoPayFailed, InvoiceSent, PaymentReceipt, RefundReceipt, StatementEmail, type InvoiceEmailData } from "@/emails/invoice";
import { HubLink, PlanRenewal, PriceChange, QuoteApproved, QuoteSent, type QuoteEmailData } from "@/emails/quote";
import { ReviewRequest, VisitScheduled } from "@/emails/schedule";
import { OnMyWay, StormHeadsUp } from "@/emails/snow";
import { PhotoUploadRequest, VisitDone } from "@/emails/visit";
import { env } from "../env";
import type { EmailKey } from "./wording";

/** `props` is only what the template's subject line reads. */
export function samples(): Record<EmailKey, { props: object; el: ReactElement }> {
  const site = env.siteUrl, phone = env.phone, url = `${env.appUrl}/sample`, name = "Sam Sample", address = "123 Sample St SW, Calgary";
  const inv: InvoiceEmailData = {
    name, number: 1042, subject: "Snow clearing", issued: "Mon, Dec 1", due: "Mon, Dec 8", lines: [{ name: "Snow clearing", date: "Sat, Nov 29", amount: "$45" }],
    total: "$45", discount: null, message: null, paid: null, balance: "$45", taxNote: null, payUrl: url, etransferEmail: "pay@example.com", etransferRef: "ETC-1042",
    cardEnabled: true, site, phone,
  };
  const quote: QuoteEmailData = { name, number: 207, title: "Fall yard cleanup", message: null, validUntil: "Fri, Dec 19", total: "$180", lines: [{ name: "Yard cleanup", amount: "$150", optional: false }, { name: "Haul away", amount: "$30", optional: true }], url, site, phone };
  const visit = { name, what: "Fall yard cleanup", date: "Tue, Dec 2", address, site, phone };
  return {
    "booking.confirmation": { props: {}, el: <BookingConfirmation number={312} name={name} email="sam@example.com" phone="403-555-0101" address={address} access="" notes="" plan="One time" payment="e-Transfer" services={["Snow shovelling"]} serviceLines={["Snow shovelling (driveway + walk)"]} when="as soon as possible" estimate="$45" site={site} phone_={phone} helpEmail={env.helpEmail} etransferEmail="pay@example.com" /> },
    "photo_upload.request": { props: {}, el: <PhotoUploadRequest name="Sam" services={["Yard cleanup"]} url={url} site={site} phone={phone} /> },
    "price.change": { props: {}, el: <PriceChange name={name} address="123 Sample St SW" size="Large" was="$45" now="$60" plan url={url} site={site} phone={phone} /> },
    "visit.scheduled": { props: {}, el: <VisitScheduled {...visit} /> },
    "visit.on_my_way": { props: {}, el: <OnMyWay name={name} address={address} site={site} phone={phone} /> },
    "storm.heads_up": { props: {}, el: <StormHeadsUp name={name} address={address} cm={8} site={site} phone={phone} /> },
    "visit.done": { props: {}, el: <VisitDone name={name} address={address} when="Tue, Dec 2" what="Snow clearing" depthCm={8} photos={[]} reportUrl={url} site={site} phone={phone} /> },
    "quote.sent": { props: {}, el: <QuoteSent d={quote} /> },
    "quote.follow_up": { props: {}, el: <QuoteSent d={quote} followUp /> },
    "quote.approved": { props: {}, el: <QuoteApproved d={quote} /> },
    "invoice.sent": { props: {}, el: <InvoiceSent d={inv} /> },
    "payment.receipt": { props: {}, el: <PaymentReceipt d={{ ...inv, paid: "$45", balance: "$0" }} amount="$45" method="e-Transfer" when="Wed, Dec 3" paidInFull /> },
    "payment.refund": { props: {}, el: <RefundReceipt d={inv} amount="$20" how="by e-Transfer" when="Thu, Dec 4" /> },
    "autopay.failed": { props: { needsAction: false }, el: <AutoPayFailed d={inv} card="Visa ending 4242" why="the bank declined it" retryOn="Sat, Dec 6" needsAction={false} hubUrl={url} /> },
    "client.statement": { props: {}, el: <StatementEmail name={name} balance="$45" owing period="All history" etransferEmail="pay@example.com" site={site} phone={phone} /> },
    "visit.reminder": { props: {}, el: <VisitScheduled {...visit} reminder when="tomorrow" confirmUrl={url} /> },
    "invoice.reminder": { props: { n: 1 }, el: <InvoiceSent d={inv} reminder={1} /> },
    "plan.renewal": { props: {}, el: <PlanRenewal name={name} season="Winter 2027–28" price="$45" url={url} site={site} phone={phone} /> },
    "hub.link": { props: {}, el: <HubLink name={name} url={url} site={site} phone={phone} /> },
    "review.request": { props: {}, el: <ReviewRequest name={name} url={url} site={site} phone={phone} /> },
  };
}
