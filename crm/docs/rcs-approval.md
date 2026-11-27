# RCS agent: approval submission

Everything Telnyx asks for when you register an RCS brand and agent (Portal → Messaging → RCS).
Copy the values below. **Bold TODO** items are facts only you know.

Order: brand → agent → test devices → submit basics → submit launch → wait for LIVE.
Fees: submitting the agent charges a one-time vetting fee; launching charges a one-time launch fee
plus a monthly agent fee (amounts on telnyx.com/pricing/messaging). Brand submission is free.

## 1. Brand

| Field | Value |
|---|---|
| Display name | etc. |
| Legal name | **TODO** (the registered name, or the owner's name if it's a sole proprietorship) |
| Legal entity type | **TODO** (e.g. sole proprietorship) |
| Organization type | Small business |
| Website | https://etccrew.ca |
| Business number | **TODO** (CRA business number, if there is one) |
| Address | **TODO** street address, Calgary, AB, postal code, CA |
| Brand contact | **TODO** name and title (the adult account holder), help@etccrew.ca, +1 403-656-8200 |

## 2. Agent basics

| Field | Value |
|---|---|
| Agent name | etc. |
| Description (shown to customers) | Snow shovelling and odd jobs in Evergreen and southwest Calgary. Booking updates, before and after photos, quotes and invoices. |
| Logo (224×224) | https://etccrew.ca/img/rcs-logo.png |
| Banner / hero (1440×448) | https://etccrew.ca/img/rcs-banner.jpg |
| Brand colour | #14213D |
| Phone | +1 403-656-8200 (label: Call or text) |
| Email | help@etccrew.ca (label: Email us) |
| Website | https://etccrew.ca (label: Book online) |
| Privacy policy | https://etccrew.ca/privacy.html |
| Terms of service | https://etccrew.ca/terms.html |
| Use case | TRANSACTIONAL |
| Messaging profile | the one 403-656-8200 is on |
| Webhook URL (inbound) | https://app.etccrew.ca/api/telnyx/webhook |

## 3. Test devices

Add each owner's phone, plus +1 825-935-4500. Each phone gets an invite to accept in Google Messages
(while an invite is pending, Telnyx blocks agent edits).

## 4. Launch / campaign

**Company overview:** etc. is a small Calgary business, run by a high-school student with a parent,
that shovels snow and does odd jobs (yard work, eavestroughs, moving help) for homeowners in Evergreen
and southwest Calgary. Customers book online at etccrew.ca or by phone.

**Agent overview:** The agent texts customers who booked with us about their own jobs: when we're on
the way, when the job is done (with before and after photos), quotes, invoices and receipts. Customers
can reply, send photos of work they'd like quoted, and tap reply buttons (e.g. confirm a time).
No marketing or promotional messages.

**Interaction types:** TRANSACTIONAL_UPDATES, CUSTOMER_SUPPORT

**Message examples:**
1. Hi Jane, it's etc. We're on our way to shovel 123 Evergreen Way. See you in about 15 minutes.
2. All done at 123 Evergreen Way! Here are your before and after photos. Invoice #1042 is $35: etccrew.ca/i/… [card with photo]
3. Thanks for the photos! That eavestrough job is about 2 hours. Want us to send a quote? [Yes] [No thanks]
4. Snow's coming tonight (about 12 cm). You're on our every-snowfall list, so we'll be there by 8 a.m. [Sounds good] [Skip this one]
5. Got your e-Transfer for invoice #1042. Thanks, Jane!

**Opt-in:**

| Field | Value |
|---|---|
| Method | WEBSITE (also: customer texts us first, or asks in person or by phone) |
| Call to action | Booking form checkbox: "Text me about my booking (on our way, done with photos, invoices). Up to a few texts per job; msg & data rates may apply. Reply STOP to stop, HELP for help." |
| Call to action URL | https://etccrew.ca/book.html |
| Call to action screenshot | **TODO** screenshot of the checkbox on etccrew.ca/book.html (contact step) |
| Double opt-in | No (customers opt in while booking a specific job) |
| Opt-in message | You're signed up for etc. booking texts. Reply STOP to stop, HELP for help. |
| HELP response | etc. snow shovelling & odd jobs, Calgary. Call or text 403-656-8200, or email help@etccrew.ca. Reply STOP to stop texts. |
| STOP response | You won't get any more texts from etc. Reply START to turn them back on. |

The CRM already sends exactly these HELP and STOP replies over RCS (see `HELP_TEXT` / `STOP_TEXT` in
`src/server/ops/texts.ts`); keep them in sync if you change the wording here.

**Testing video (test_url):** **TODO** record a short screen video on a test phone showing: texting the
agent, the reply, then HELP (answer arrives), STOP (confirmation), START. Upload it unlisted
(YouTube or Google Drive, anyone with the link) and paste the link.

## 5. After approval

1. Copy the agent id from Telnyx.
2. In Coolify (etc-crm → Environment), set `TELNYX_RCS_AGENT_ID` to it and redeploy.
3. Composer shows "RCS when their phone supports it". RCS phones get branded chat, read receipts,
   photo cards and reply buttons; everyone else keeps getting SMS/MMS.
