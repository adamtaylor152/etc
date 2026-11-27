# etc.

Website for Silas's snow shovelling & odd-jobs business. Static pages in `public/`, plus a small Python (stdlib only) server that takes bookings.

- `public/index.html` is the landing page. Update the tuition tracker by editing `PROGRESS` near the bottom.
- Before & after photos: drop both photos in `public/img/work/` and add a line to `WORK` near the bottom of `public/index.html`. Take both shots from the same spot, landscape; they're shown 4:3. The section and its "Our work" nav link stay hidden until the first pair is added, then appear on their own.
- `public/book.html` is the booking wizard. It posts to `POST /api/bookings`.
- `server.py` serves `public/`, saves bookings to SQLite (`$DATA_DIR/bookings.db`), and emails the owner and the customer.

## Run locally

```bash
GOOGLE_MAPS_KEY=... PORT=8768 python3 server.py
```

Without SMTP settings, bookings are still saved and the emails are just logged as skipped.

```bash
python3 tests/test_server.py
```

## Deploy on Coolify

1. New resource → this Git repo → build pack **Dockerfile**. Port **8080**.
2. Add a persistent volume mounted at **`/data`** (this is where bookings live).
3. Environment variables:

| Variable | What |
|---|---|
| `GOOGLE_MAPS_KEY` | Browser key with Maps JavaScript API + Places API, restricted to `etccrew.ca/*` |
| `OWNER_EMAIL` | Where new-booking notices go |
| `MAIL_FROM` | From address (defaults to `OWNER_EMAIL`) |
| `HELP_EMAIL` | Public contact shown on the site and in emails; customer replies go here (default `help@etccrew.ca`) |
| `ETRANSFER_EMAIL` | Address shown to customers paying by e-Transfer (defaults to `OWNER_EMAIL`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Outgoing mail |
| `SMTP_TLS` | `starttls` (default), `ssl` (port 465) or `none` |
| `WEATHER_USER_AGENT` | Sent to MET Norway for the snow forecast. They ask for an app name plus contact, e.g. `etc-website/1.0 help@etccrew.ca` |

Health check: `GET /healthz`.

### Email via Brevo (free: 300 emails/day, about 150 bookings/day)

1. Sign up at brevo.com (free plan).
2. **Senders, Domains & Dedicated IPs → Domains**: add `etccrew.ca` and add the DNS records Brevo shows (DKIM + DMARC). This keeps confirmations out of spam. Then add a sender like `bookings@etccrew.ca`.
3. **SMTP & API → SMTP**: generate an SMTP key.
4. In Coolify:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<the "Login" shown on Brevo's SMTP page>
SMTP_PASSWORD=<the SMTP key>
MAIL_FROM=etc. <bookings@etccrew.ca>
OWNER_EMAIL=<where Silas/Dad want booking notices>
ETRANSFER_EMAIL=<the e-Transfer address>
```

Any other SMTP provider (Mailjet, SMTP2GO, Resend…) works the same way; only these variables change.

## Looking at bookings

```bash
sqlite3 /data/bookings.db "select id, created_at, name, address, services, estimate from bookings order by id desc limit 20"
```
