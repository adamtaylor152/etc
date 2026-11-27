# etc. CRM

The back office for etc.: bookings, clients, jobs, visits, snow plans, and (in later milestones) storms, routes, photos, invoices, payments and quotes. Built with Next.js 16, Postgres 17 and Prisma 7, and served at `app.etccrew.ca`.

The full plan, milestones M0 to M8, is in the PR description.

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

4. **Cloudflare:** add a proxied A record for `app`. Turn Rocket Loader off for `app.`.
5. **Switch the site over:** set `CRM_BOOKING_URL=https://app.etccrew.ca/api/public/bookings` on the Python site.

**Backups:** turn on Coolify's scheduled Postgres backups (daily, keep 14), and copy that directory off the box (for example, rclone to B2 or R2). Take a manual dump before every schema migration.
