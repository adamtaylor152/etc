# etc. CRM

The back office for etc. Built with Next.js 16, Postgres 17 and Prisma 7, and served at `app.etccrew.ca`.

**What it does**
- **Bookings:** from etccrew.ca or `/book`, each becoming a client, a property (with its Calgary community), a request, and a job or snow plan.
- **Snow:** every-snowfall plans with trigger depths. "It's snowing" starts a storm and creates visits in route order. Extra pushes, depth changes, cancelling, a printable proof-of-service report, and forecast alerts from MET Norway.
- **Field view on the phone:** On my way, Arrived, Done (depth, ice melt, GPS), Skip, before/after photos, and Got cash / Got e-Transfer.
- **Routes:** a map with community outlines and numbered stops, auto-ordered by distance from home, nudged with ↑/↓, printable, with one-tap multi-stop navigation.
- **Billing:**
  - Visits make charges, and charges make invoices (per visit, per storm, monthly, or fixed price).
  - e-Transfer reference codes, Stripe Checkout for cards, an Interac email auto-match.
  - Receipts for every payment, reminders at 3 and 10 days, and a payments CSV.
- **Quotes:**
  - Built from a request with the client's photos alongside; optional extras.
  - The client approves online or asks for changes; follow-ups go out by themselves.
  - Convert to a job, and the client's photos carry onto it.
- **Client hub:** a no-password page with visits, photos, quotes and invoices. Clients can pause or renew their snow plan and request more work.
- **Schedule:** a calendar with drag-to-reschedule, recurring jobs (weekly, every 2 weeks, monthly) and reminder emails.
- **Extras:** Reports, Settings (business, GST, automations, seasons, price book), review requests, a daily digest, an installable phone app with offline route pages, and live tuition and "Our work" feeds for etccrew.ca.

## Run locally

```bash
docker compose up -d                 # Postgres :5433, Mailpit UI http://localhost:8025
cp .env.example .env                 # set OWNER_EMAILS to your own email
pnpm install
pnpm prisma migrate dev
pnpm db:seed                         # business, owners, price book, Calgary communities, this season
pnpm dev                             # http://localhost:3000
```

To sign in, open `/login` and enter an owner email. The sign-in link arrives in Mailpit.

To try the real booking form against the CRM, run the Python site with `CRM_BOOKING_URL=http://localhost:3000/api/public/bookings PORT=8768 python3 server.py` and open `http://localhost:8768/book.html`.

```bash
pnpm test          # vitest: booking parity with the Python site, statuses, tokens, dates, communities
pnpm typecheck && pnpm lint && pnpm build
```

## How bookings flow

1. `book.html` posts to `CRM_BOOKING_URL` when `/config.js` sets one.
2. If the CRM is down or returns 5xx, the page re-posts to the Python `/api/bookings`, so a booking is never lost.
3. To roll back, clear `CRM_BOOKING_URL` on the site.
4. `POST /api/public/bookings` does the following:
   - Validates with an exact port of the Python `validate()` and `estimate()`.
   - In one transaction, creates or matches the **client** (by email) and the **property** (by place id or address, with its community from the map pin).
   - Creates the **request**.
   - One-time shovelling becomes a **one-off job** with a visit. Every-snowfall becomes this season's **snow plan**. Anything else waits for a quote.
   - Queues the emails.
5. Emails go through an **outbox** table after commit:
   - Owners get "New booking", with a personal **Open in etc. CRM** link that signs them in and opens the request.
   - The customer gets the same confirmation email as before.

## Sign-in and links

- There are no passwords. A link token is 32 random bytes, and only its sha256 is stored.
- Opening a link (GET) only shows a **Continue** button. The token is used when that button is clicked (POST). Outlook Safe Links and other scanners open links automatically, and this stops them using it up.
- Sign-in links expire after 20 minutes and work once. Owner deep links last 7 days and work 10 times.
- Addresses on `OWNER_CC` that aren't owners get a link that requires signing in.

## Import the old bookings

Run this once at cutover. It's safe to re-run, and doing so also picks up any bookings that went to the old endpoint during a CRM outage:

```bash
docker cp <site-container>:/data/bookings.db .
sqlite3 -json bookings.db "select * from bookings" > bookings.json
GOOGLE_GEOCODING_KEY=... pnpm import:legacy bookings.json
```

- Request numbers keep the legacy booking ids.
- Every-snowfall bookings become active snow plans.
- Past one-time bookings are imported closed.

## Deploy on Coolify

1. **Postgres:** New resource → PostgreSQL 17. Copy its internal URL.
2. **App:** New resource from this repo, build pack **Dockerfile**, base directory **`/crm`**, watch paths `crm/**`, port **3000**, domain `https://app.etccrew.ca`.
   - Mount a persistent volume at `/data` (photo uploads, from M3).
   - On start, the container runs `prisma migrate deploy` and the idempotent seed, then starts the server. Health check: `/api/healthz`.
3. **Environment variables:**

| Variable | What |
|---|---|
| `DATABASE_URL` | Postgres URL from step 1 |
| `APP_URL` | `https://app.etccrew.ca` |
| `OWNER_EMAILS` | Comma-separated emails that can sign in. They are added as owners on every start. |
| `OWNER_CC` | Others copied on new-booking notices. They get no sign-in link. |
| `PUBLIC_SITE_ORIGINS` | `https://etccrew.ca`, the origins allowed to post bookings |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_TLS` / `MAIL_FROM` | Same as the Python site (Brevo) |
| `HELP_EMAIL`, `ETRANSFER_EMAIL`, `SITE_URL` | Shown in emails |
| `MEDIA_SIGNING_SECRET` | 32+ random bytes (photo links, M3) |
| `EMAIL_DAILY_CAP` | Default 300 (Brevo free). Low-priority mail waits once you're within 30 of the cap. |
| `UPLOAD_DIR` | Default `/data/uploads` (the volume) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional: card payments. Stripe account in an adult's name; webhook → `https://app.etccrew.ca/api/stripe/webhook`, event `checkout.session.completed` |
| `TELNYX_API_KEY` | Texting (Telnyx). Set it in Coolify yourself; never commit it. |
| `TELNYX_FROM` | The business number in E.164: `+14036568200` |
| `TELNYX_PUBLIC_KEY` | Telnyx portal → Account → Public key (verifies inbound webhooks) |
| `TELNYX_MESSAGING_PROFILE_ID` | Optional: the messaging profile the number belongs to |
| `INTERAC_INBOUND_SECRET` | Optional: 32+ random chars, shared with the Cloudflare Email Worker below |
| `WEATHER_USER_AGENT` | Sent to MET Norway, e.g. `etc-crm/1.0 help@etccrew.ca` |
| `GOOGLE_GEOCODING_KEY` | Optional: only for `import:legacy` |

4. **Cloudflare:** add a proxied A record for `app`. Turn Rocket Loader off for `app.`.
5. **Switch the site over:** set `CRM_BOOKING_URL=https://app.etccrew.ca/api/public/bookings` on the Python site.

### Stripe (card payments)

Create the Stripe account in Dad's name (Silas is a minor). Use test keys first: run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, pay a test invoice, and confirm the receipt arrives. Card fees are absorbed, with no surcharge.

### Interac e-Transfer auto-match

`pay@etccrew.ca` (the address clients send e-Transfers to) is routed by Cloudflare Email Routing to the `etc-interac` email Worker. The Worker posts each raw email to the CRM:

```js
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    await fetch("https://app.etccrew.ca/api/interac/email", { method: "POST", body: raw, headers: { "content-type": "message/rfc822" } });
    if (env.FORWARD_TO) await message.forward(env.FORWARD_TO); // optional copy to a verified inbox
  },
};
```

- **No shared secret:** the CRM only trusts emails with a valid DKIM signature from `interac.ca` that matches the From address. Everything else is ignored.
- **Recording payments:** auto-deposited notices that mention `ETC-<invoice number>` (or match one open invoice by amount and last name) are recorded and the receipt emailed. Anything else goes to the owners: notices that still need depositing, and payments it couldn't match.
- **Autodeposit:** register `pay@etccrew.ca` for Interac Autodeposit at the bank so payments land without a click.

### Booking page cutover

- `book.html` on etccrew.ca posts to the CRM when `CRM_BOOKING_URL` is set, and falls back to the Python endpoint.
- The CRM also serves its own `/book`, priced from the price book.
- Retiring the Python endpoint is a later step, after this season:
  1. Point the site's Book links at `https://app.etccrew.ca/book`.
  2. Run a final `import:legacy`.
  3. Delete `/api/bookings` from `server.py`.

### Marketing-site feeds

When `CRM_BOOKING_URL` is set, etccrew.ca's tuition tracker and "Our work" gallery load from `GET /api/public/site`:
- **Tracker:** money earned and jobs done.
- **Gallery:** before/after photos an owner starred "★ Website", which they should only do with the client's OK.

Captions show only the community and month.

### Texting (Telnyx)

1. In the Telnyx portal, make sure 403-656-8200 is on a **Messaging Profile**. Set that profile's inbound webhook URL to `https://app.etccrew.ca/api/telnyx/webhook`.
2. Copy the account's **public key** into `TELNYX_PUBLIC_KEY`, and an **API key** into `TELNYX_API_KEY`, in Coolify. Then redeploy.

What texting does:
- **Messages page:** two-way texts with clients. Replies show up in the conversation, and owners get an email for each new text (at most one every 15 minutes per conversation).
- **Automatic texts:** "on the way", "all done" with a photo link, and storm day, sent only to clients who opted in.
- **Opt-out:** a client who texts STOP gets no texts at all until they text START.

### Support scripts

```bash
pnpm tsx scripts/mint-hub-link.ts client@example.com   # print a client-hub link
```

**Backups:** turn on Coolify's scheduled Postgres backups (daily, keep 14), and copy that directory off the box (for example, rclone to B2 or R2). Take a manual dump before every schema migration.
