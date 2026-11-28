# etc. CRM: feature inventory (code audit)

Audit date: 2026-11-28. Branch `ajpc/jobber-feature-audit-2f2b44` at `5bad8f4`. Read-only audit of `crm/` (Next.js 16, Prisma 7, Postgres 17). All paths are relative to `crm/` unless they start with `.github/` or `tests/`.

**How this was checked**

- Read in full by the lead auditor: `prisma/schema.prisma`, `prisma/seed.ts`, and most of `src/server/**` (scheduler, settings, auth, routing, runner, availability, schedule, recurrence, booking/slots, forecast, storms, invoices, billing/*, unmatched, stripe, quotes, status/*, signatures, jobs, visits, costing, clients, calls, marketing, drive-size, the first half of campaigns).
- Read in full by two sub-audits: every file under `src/app/(owner)/`, `src/app/(public)/`, `src/app/api/`, `src/components/`, plus `public/sw.js`, CI workflows and scripts.
- Skimmed only (headers and exports): `src/server/ops/texts.ts`, `sms.ts`, `ops/checklists.ts`, `ops/tasks.ts`, `ops/notes.ts`, `search.ts`, `activity.ts`, `media.ts`, `email/templates.tsx`, `src/emails/*`, unit test bodies.
- Nothing was run. No app was started, no tests executed. Every statement is from reading code.

**Scale**: about 1 MB of TypeScript, 50 Prisma models, 16 migrations (all dated 2026-11-27/28), 15 unit test files and 1 integration test.

---

## 0. Cross-cutting facts that affect every area

| Fact | Evidence |
|---|---|
| **No roles or permissions in practice.** `UserRole { OWNER, CREW }` exists but no code reads `user.role`. The only guard is `requireOwner`, which checks session + `active`. New team members are created with `role: "OWNER"`. | `src/server/auth.ts`, `src/app/(owner)/settings/team/actions.ts:26` |
| **Single business in practice.** Every table has `businessId`, but login, webhooks and alerts resolve one business from `BUSINESS_SLUG`; owner notification emails go to the `OWNER_EMAILS` env list, not to users. | `src/server/scheduler.ts`, `src/app/login/actions.ts` |
| **Computed statuses.** Job status, visit "late/today/unscheduled", invoice "past due/partial" and quote "expired" are derived at read time, never stored. | `src/server/status/job.ts`, `src/server/billing/invoice.ts` |
| **Automation engine is a 60-second in-process tick** plus an hourly block under a Postgres advisory lock. There is no user-configurable workflow builder; each automation is a hard-coded function with an on/off switch. | `src/server/scheduler.ts`, `src/server/settings.ts` |
| **Email/SMS go through one outbox table** with dedupe keys, retries (6 attempts), priority and a daily email cap (default 300, 30 reserved for priority mail). | `src/server/email/outbox.ts` |
| **Lists do not paginate.** Requests/quotes/invoices load `take: 1000`; clients and jobs load all rows and filter/sort in JS. | `src/components/list-page.tsx`, `src/app/(owner)/*/page.tsx` |
| **Schema fields with no code path** (dead or reserved): `Client.altEmails`, `Job.seasonalPriceCents`, `EmailTemplateOverride` (whole model), `SnowBillingMode.SEASONAL` and `PER_EVENT` (handled in `chargesForVisit` but nothing ever sets them), `UserRole.CREW`, `InvoiceSchedule.MANUAL`, `Client.emailBouncedAt` (read in many places, never written), `PaymentMethod.CARD` for manual entry. | grep across `src/` |

---

## 1. Clients / CRM

### What exists
- Clients, multiple properties per client, extra contacts, tags, notes with attachments, call log, activity feed, lead source, derived lead/active/archived status, global search, client statement, per-client collect-payment screen.

### Depth details
- **Client model** (`prisma/schema.prisma` `Client`): title, first/last, company, primary email + `emails[]` JSON (address, label), primary phone + `phones[]` JSON (number, label, sms flag), lead source (9 fixed suggestions in `src/server/clients.ts` `LEAD_SOURCES`), `source` enum (booking form, manual, phone, referral, hub, import), tags (string array, max 20), free-text notes, preferred payment, comms toggles (`followUpQuotes`, `followUpInvoices`, `visitReminders`, `marketingOptOut`, `smsOptIn`, `smsOptOutAt`), CASL consent timestamp + source, referral code and referrer, archive timestamp.
- **Contacts** (`ClientContact`): role, name, phone, email, `isBilling`, `receivesTexts`. Max 10. Contact phone numbers are used to match inbound texts/calls to the client (`numbersOf` in `src/server/clients.ts`).
- **Properties** (`Property`): formatted + normalized address, Google place id, lat/lng, geocode source, City of Calgary community (point-in-polygon, `src/server/communities.ts`), label, access notes, gate code, pet notes, hazards, standing `routeSort`, driveway size (standard/large/oversized) + extra-sidewalk flag + `sizeCheckedAt`, default flag, archive.
- **List** (`src/app/(owner)/clients/page.tsx`): filters by derived status and tag; search over name, email, first property address, tags, phone digits; sort by name, last activity, balance; one bulk action (add/remove tag).
- **Detail** (`src/app/(owner)/clients/[id]/page.tsx`): tabs Overview / Activity / Communication (texts, calls, emails) / Files; lifetime value; balance; create menu for every record type; email hub link; archive/restore.
- **Dedupe**: only on public booking. Client matched by exact email (never overwrites an existing name); property matched by place id or normalized address (`src/server/booking/create.ts`). Phone numbers are normalised to E.164 and deduped within one client.
- **Notes** (`src/server/ops/notes.ts`): on client, request, quote, job, visit or invoice; files; pin; edit; delete; "link downstream" so a client note shows on that client's requests, quotes, jobs and invoices.
- **Calls** (`src/server/ops/calls.ts`): manual log (direction, outcome, minutes, notes) plus automatic pull of Telnyx call detail records every 5 minutes, deduped by provider id, matched to a client by number.
- **Activity** (`src/server/activity.ts`, `ActivityEvent`): typed events with actor (user / client / system); account-wide feed with type filter and cursor paging; per-client feed.
- **Search** (`src/server/search.ts`): Cmd-K box over clients, properties, requests, quotes, jobs, invoices; understands `#12`, `ETC-1042` and phone digits.
- **Statement** (`src/server/billing/ledger.ts`): running-balance ledger with opening balance; ranges lifetime / since last zero / from a date. Owner and client-hub versions, both print-only.

### Visible gaps
- **No custom fields** on any object.
- **No import** UI or CSV import for clients; the only importer is a one-off legacy SQLite script (`scripts/import-legacy-bookings.ts`). **No client export.**
- **No merge/dedupe tool**, no duplicate warning on manual create, no delete (archive only).
- **No lead pipeline**: "lead" is just "has no job yet". No stages, no lead owner, no lost reason, no follow-up tasks generated.
- `isBilling` contact flag is stored but invoices, receipts and reminders always go to `client.email` (no use found in `src/server`).
- `emailBouncedAt` is never set, so bounce suppression never triggers.
- No per-client tax, terms or price overrides. Preferred payment is displayed but not editable in the client form.
- Property has no service-specific attributes other than snow driveway size (no lot size, no lawn area, no equipment notes), no per-property tax, no restore-from-archive UI.
- Notes/visits/tasks/messages/payments are not searchable.
- Call log has no list page and no recordings, voicemail transcripts or click-to-call bridge (`tel:` link only).

---

## 2. Requests, online booking, assessments

### What exists
- Public booking API used by two front ends, hand-made requests, online assessment slot booking, request photos, request to quote/job conversion.

### Depth details
- **Request model**: number, status (`NEW`, `ASSESSMENT_SCHEDULED`, `CONVERTED`, `ARCHIVED`), title, service labels, snow plan choice, ice melt, preferred date, preferred payment, notes, access notes, the exact estimate string shown to the customer, raw payload, IP, user agent, `assessmentAt`.
- **Booking API** (`src/app/api/public/bookings/route.ts`, `src/server/booking/validate.ts`, `create.ts`): one transaction creates/matches client, property, request. One-time snow shovelling becomes a one-off job with a visit; "every snowfall" becomes this season's snow plan (one open plan per property per season, enforced by a raw SQL unique index); anything else waits for a quote. Oversized driveways are routed to a quote. Confirmation email to client and "new booking" email with deep link to owners.
- **Anti-abuse**: 16 KB body cap, honeypot field, 5 bookings per 10 minutes per IP (in-memory, resets on restart), CORS allow-list. Falls back to the legacy Python endpoint if the CRM is down (`README.md`).
- **Slots** (`src/server/booking/slots.ts`, `/api/public/slots`): four named arrival windows (Overnight 3-6, Early 6-11, Mid-day 10-17, Evening 17-22) and hourly start times; 1-day lead, 14-day horizon, 60-minute assessment; union of team working hours minus time off and existing visits/tasks; slot re-validated at submit (409 if taken); books a Task on the first free person's calendar and sets the request to `ASSESSMENT_SCHEDULED`.
- **Photos**: up to 20 at booking, token-scoped upload page `/u/[token]`, "Ask client for photos" email from the request page.
- **Referral code** captured from `?ref=`; SMS opt-in and marketing consent captured.
- **Pricing in booking**: price book unit prices; snow priced by driveway size (standard/large), extra sidewalk and ice melt add-ons, $5 off for every-snowfall (per sub-audit of `src/components/booking-form.tsx`).

### Visible gaps
- **The CRM's own `/book` form is thinner than the API.** `src/components/booking-form.tsx` never sends `slot`, `ref`, marketing consent or lat/lng; only the static marketing-site `book.html` does. So `/book` has no time picker, no address autocomplete, no referral capture.
- **Service list is hard-coded** to 14 labels in `validate.ts`; adding a bookable service needs a code change.
- No configurable intake form or custom questions, no conditional fields.
- No deposit or payment at booking.
- No service-area rejection or waitlist; no CAPTCHA or email verification.
- Requests cannot be edited after creation; assessment cannot be rescheduled or marked complete from the request page; no assessment notes/forms.
- Client cannot self-reschedule or cancel an assessment.
- No "overdue request" status beyond a dashboard count of requests waiting 3+ days.

---

## 3. Quotes, price book

### What exists
- Quote builder with optional lines, flat discount, expiry, deposit, online approval with drawn signature, change requests, one automatic follow-up, convert to job, in-person signature.

### Depth details
- **Model**: `Quote` (status `DRAFT`, `AWAITING_RESPONSE`, `CHANGES_REQUESTED`, `APPROVED`, `CONVERTED`, `ARCHIVED`; title, message, subtotal, discount, tax, total, `validUntil` default +30 days, deposit type/value/required, sent/first-viewed/approved timestamps, approver name and IP, change-request message). `QuoteLineItem` (name, description, decimal qty, unit price, `isOptional`, `isSelected`, sort).
- **State machine** (`src/server/status/quote.ts`): strict transitions; editable only in draft or changes-requested; never returns to draft once sent; computed "expired".
- **Client page** `/q/[token]`: ticks optional lines with live total; approve needs typed name + drawn signature + consent box; "ask for changes" free text; expired quotes blocked.
- **Signature evidence** (`src/server/ops/signatures.ts`): stored PNG, signer name, fixed statement, SHA-256 hash of the document at signing, IP, user agent, in-person flag, minimum-ink check.
- **Deposits** (`createDepositInvoice` in `src/server/ops/invoices.ts`): on approval a separate `DEPOSIT` invoice is created (percent or fixed), payable by card or e-Transfer with its own reference; later job invoices automatically get a "Less deposit" credit line, each deposit used once and never more than the invoice.
- **Follow-up**: one email 3 days after sending if still awaiting, 9am-7pm only, per-client opt-out (`quoteFollowUps` in `scheduler.ts`).
- **Convert** (`convertQuote`): one-off job with selected lines, fixed-price or per-visit billing, optional first visit date; request marked converted; quote photos carried to the job.
- **Price book** (`Service`): key, name, booking label, category (snow, cleanup, washing, fix-up, add-on, other), fixed-or-quote pricing, unit price, unit (each, visit, push, hour, season), add-on flag, default checklist, bookable, active, sort. 19 seeded services, only 6 with prices (`prisma/seed.ts`).

### Visible gaps
- **No quote templates, no packages/bundles, no multi-option (good/better/best) quotes.** Optional line items are the only upsell device.
- **No tax on quotes**: `quoteTotal` ignores tax; `Quote.taxCents` is never computed.
- Discount is a flat dollar amount only (no percent, no per-line discount).
- No line-item images, no cost/markup/margin view, no drag reorder; max 40 lines with fixed blank rows.
- **Price book is nearly read-only**: Settings can change price and active flag only. No add, rename, describe, delete, categorise, cost or tax-rate per service (`src/app/(owner)/settings/actions.ts` `savePrice`).
- Quotes are sent by email only (no SMS send). No decline button for the client; no PDF.
- No duplicate quote, no un-archive, no delete; no "convert to recurring job"; deposit is not collected inline on the approval page (link to a second page).
- Only one follow-up, fixed at 3 days; not configurable.
- Quote page comment promises photos but none are rendered to the client (per sub-audit).
- `depositRequired` is display-only; nothing blocks conversion or scheduling when the deposit is unpaid.

---

## 4. Jobs, visits, checklists, costing

### What exists
- Three job kinds (one-off, recurring, snow plan), visits with a field state machine, per-visit charges, checklists, before/after photos, completion signature, time tracking, expenses, job profit.

### Depth details
- **Job model**: number, kind, title, crew instructions, billing type (fixed price / per visit), invoice schedule (after each visit, per snow event, monthly, on completion), line items (`perVisit` flag), recurrence rule + start/end + as-needed, snow fields (trigger cm, price per push, ice melt, paused, size hold, pending price), checklist template, require-signature, closed + reason.
- **One-off creation** (`createOneOffJob`, `src/app/(owner)/jobs/new/page.tsx`): date/time or arrival-window chips, "schedule later", up to 4 extra visit dates in the form (20 server-side), assignees, line items from the price book, checklist choice, billing type.
- **Recurring** (`src/server/recurrence.ts`, `generateRecurringVisits`): weekly, every 2 weeks, monthly (first chosen weekday of the month or day-of-month), weekday picks, end date, or "as needed". Visits materialised 90 days ahead, topped up hourly, idempotent on (job, recurrenceDate). Changing the rule deletes only untouched future visits; moved visits are flagged detached and kept. Billing is hard-coded to per-visit charges invoiced monthly on the 1st.
- **Visit model**: scheduled date, start/end, anytime flag, state (`SCHEDULED`, `EN_ROUTE`, `IN_PROGRESS`, `COMPLETED`, `SKIPPED`, `CANCELLED`), multi-assignee, en-route/arrived/completed timestamps, completed-by and GPS point, skip reason (7 values) + note, snow depth, ice-melt applied, client confirmation and reschedule request, storm and push number.
- **Completion logic** (`transitionVisit`, `src/server/ops/visits.ts`): blocks on required checklist items and on a missing signature when the job requires one; rebuilds un-invoiced charges so re-completing never double-bills; auto-creates (and by default issues) the invoice for per-visit one-off jobs; queues the "all done" email/SMS 5 minutes later so late photos are included; reopen is refused once invoiced.
- **Checklists** (`src/server/ops/checklists.ts`): templates with item types checkbox, yes/no, text, number, photo; required and show-to-client flags; auto-attached by service; each visit gets a snapshot copy; client-visible answers appear on the visit report.
- **Photos** (`src/server/media.ts`): before/after/other, up to 20 per upload, 25 MB each, auto-rotated, metadata stripped, WebP variants, capture lat/lng, share-with-client toggle, "show on website" toggle with consent timestamp.
- **Time tracking** (`src/server/ops/costing.ts`): start/stop timer per visit (one running timer per person), manual entries, edit/delete.
- **Expenses**: per job or general; 7 fixed categories; receipt image/PDF; month CSV export.
- **Job costing** (`jobProfit`): revenue (invoiced + unbilled, or estimate) minus labour (minutes x person's hourly cost) minus expenses; margin percent. Shown on the job page and in Reports.

### Visible gaps
- **Jobs are not editable after creation**: title, instructions, property, billing type and line items are read-only on the job page (per sub-audit of `src/app/(owner)/jobs/[id]/page.tsx`). Only snow-plan price/trigger and the recurrence rule can be changed.
- Recurring-job form is much thinner than one-off: two line rows, no assignees, no times, no checklist choice, no billing choice. Recurring visits are always "anytime" and unassigned when generated.
- No recurrence beyond weekly/biweekly/monthly (no every-N-weeks, no quarterly/annual, no custom); no seasonal pause for recurring jobs.
- No per-visit line-item or price overrides; visit charges cannot be edited before invoicing.
- No job templates, no duplicate job, no multi-property jobs.
- Checklists are the only "job form"; no standalone forms, no conditional logic, no PDF of a completed form.
- Timers exist only per visit; no general clock-in/out, no breaks, no GPS on clock events, no approval step.
- Expenses have no vendor, tax split, reimbursable flag, edit, or billable-to-client pass-through.
- **No materials tracking on jobs** (see section 5).
- No Cancel button on the visit page (state exists); skip note is not offered in the route runner.

---

## 5. "Ordering": materials, inventory, purchase orders, suppliers, client self-ordering

### What exists
- An `Expense` table (category such as "Materials", "Ice melt / salt", "Fuel", "Dump fees") with a receipt attachment.
- Two priced add-ons (ice melt, extra sidewalk) selectable on the booking form.
- Client hub free-text "Need something else?" which creates a request.

### Depth details
- Ice melt is a boolean per visit that adds a fixed charge; there is no quantity (bags, kg) and no stock.

### Visible gaps
- **No inventory, no stock levels, no materials list on jobs, no purchase orders, no suppliers/vendors, no markup on materials, no supplier catalogue or price-list import.** Nothing in the schema models any of these.
- **No client self-service ordering**: a client cannot pick a service, add-on or time from the hub, cannot reorder a past job, and cannot buy anything online other than paying an invoice. The only self-serve "purchase" flows are the booking form and one-click snow-plan renewal.

---

## 6. Scheduling and dispatch

### What exists
- Calendar (month/week/day/list) with drag-and-drop, unscheduled drawer, team board with map, find-a-time suggestions, bulk reschedule, working hours and time off, conflict warnings, tasks and events, client confirmation and reschedule requests.

### Depth details
- **Calendar** (`src/components/calendar.tsx`, FullCalendar): shows visits, tasks, events, assessments; filters by type, person (incl. unassigned) and status; drag/resize to reschedule with server-side conflict warnings; drag from Unscheduled onto a day; click-empty-slot to create; multi-person assignment from the popover; icons for confirmed and reschedule-requested.
- **Conflict engine** (`src/server/availability.ts`): double-booking, day off, time off, outside working hours, business closed. Warnings only; nothing is blocked.
- **Find a time** (`suggestSlots`): first free slot per person per day, ranked by date, then straight-line distance to that person's other stops that day, then time.
- **Team board** (`src/components/team-board.tsx`, `/schedule/team`): person x day lanes, unassigned lane, time-off hatching, drag to reassign/move, day map with pins coloured by person.
- **Bulk changes** (`/schedule/bulk`): filter by range and person; move to a date or shift by N days and/or reassign; optional client email.
- **Arrival windows**: four fixed named windows (`src/server/windows.ts`) used in job creation and online booking.
- **Availability** (`User.workHours` JSON per weekday, `TimeOff` per person or business-wide).
- **Client side**: day-before reminder with a Confirm link; `/c/[token]` lets the client confirm or ask to reschedule with free text; owners are emailed; moving the visit clears the confirmation.
- **Tasks/events** (`src/server/ops/tasks.ts`): assignees, client/job link, repeat daily/weekly/biweekly/monthly materialised up to a year (max 120), edit "this one" or "this and later".

### Visible gaps
- No resource/timeline view (people as columns across a day), no map view inside the calendar, no capacity or utilisation view.
- Team board uses native HTML5 drag events, so it is likely desktop-only (per sub-audit; untested).
- Arrival windows are four hard-coded ranges, not configurable, and are not stored as a window on the visit (only start/end).
- Conflicts never block; no skills/equipment matching; no crew/team entity (only individual users); no vehicles.
- Client cannot pick a new time when asking to reschedule.
- No calendar sync (no ICS feed, no Google/Outlook).
- Visit reminder timing is fixed (5pm the day before); no same-day reminder; snow visits never get reminders.

---

## 7. Snow operations (storm-day runner)

### What exists
- Seasons, every-snowfall plans with trigger depth, storms ("snow events") with pushes, forecast-driven alerts and auto-created forecast storms, proof-of-service report, driveway size check with client price approval, season renewals.

### Depth details
- **Storm lifecycle** (`src/server/ops/storms.ts`): `FORECAST` -> `ACTIVE` -> `COMPLETED` / `CANCELLED`. Starting a storm creates one visit per plan whose trigger depth is met (unique per job/storm/push, safe to re-run); waiting one-time shovelling bookings ride along. Changing the depth adds newly qualifying plans and auto-skips un-started ones that no longer qualify (and restores them if depth rises again). "Add push" creates another round. Finish creates one draft invoice per client for the storm. Cancel cancels un-started visits and returns ride-along bookings to waiting.
- **Forecast** (`src/server/forecast.ts`): MET Norway point forecast for Calgary, 30-minute cache, stale-on-error; 1 mm precipitation = 1 cm snow rule of thumb. Hourly check emails owners once per snowy day when today/tomorrow meets at least one plan trigger, and pre-creates a `FORECAST` storm. Forecast snapshot (48 periods) saved on the storm.
- **Client notices**: optional "you're on our route" email and SMS at storm start.
- **Report** (`/snow/[id]/report`, `/api/export/storm/[id]`): per address push, result, arrived/done times, depth, ice melt, GPS, photos; printable and CSV.
- **Driveway size** (`src/server/ops/drive-size.ts`): owner checks satellite view; same/smaller applies the price; bigger holds the job (off the route) and sends the client a price-change link (accept, or cancel at no charge); oversized holds for a quote.
- **Renewals** (`renewPlan`): copies last plan into the next season; bulk renewal email; one-click renew from the hub.

### Visible gaps
- **Only per-push pricing is reachable.** Per-event and seasonal flat-rate modes exist in `chargesForVisit` and the schema but nothing sets them; `seasonalPriceCents` is unused. No seasonal contract invoicing, no instalments, no snowfall caps or tiered-by-depth pricing.
- Depth is one number per storm entered by hand; no per-zone depth, no automatic measured-snowfall feed.
- Forecast is a single point for the whole city.
- No salt/ice-melt quantity tracking; no equipment tracking; no subcontractor assignment.
- Storm cancel has no confirmation prompt (per sub-audit).

---

## 8. Routes

### What exists
- Route planner page with map, a standing stop order reused every storm, auto-order, manual nudges, split between people, printable sheet, Google Maps hand-off, phone route runner.

### Depth details
- **What "auto-order" actually does** (`src/server/ops/routes.ts`, `src/server/routing/order.ts`):
  1. Takes every non-archived property with an open job.
  2. Groups by Calgary community; walks communities in the fixed service-area order from the seed (`ServiceCommunity.sortOrder`, "out from Evergreen").
  3. Inside each community: nearest-neighbour from the current point, then open-path 2-opt, using **straight-line (haversine) distance**. The end of one community is the start for the next. Start point is the depot lat/lng.
  4. Writes `Property.routeSort` in steps of 10. Properties with no pin go last, alphabetically.
  - The result is a **standing order per property**, not a per-day optimised route. Any day's route is just that day's visits sorted by community order, then `routeSort`, then address (`src/server/routing.ts`).
- **Manual**: up/down swap within a community (`moveStop`).
- **Split** (`splitRoute` in `src/server/runner.ts`): divides stops in route order between ticked people, balancing counts and keeping communities together; it overwrites assignees with one person each.
- **Map** (`src/components/route-map-inner.tsx`): Leaflet + OpenStreetMap, community outlines, numbered markers, green when done.
- **Hand-off**: "navigate next 4 stops" Google Maps link; per-stop Navigate deep link; printable route sheet.
- **On-my-way**: tapping On my way sends an SMS (opt-in clients) and optional email; runner has a toggle to text the next client automatically when a stop is finished.

### Visible gaps
- **No road-network routing**: no drive times, no distance matrix, no traffic, no ETA shown anywhere, no route polyline. The code comment names OSRM/Google as the future upgrade.
- **No time-window or capacity constraints** in ordering; timed visits are not respected by the order.
- **Not truly multi-vehicle**: no vehicle entity, no per-person start/end location, no return-to-depot, no balancing by drive time (split is by stop count only). One depot for everyone.
- Community order is seed data with no UI to change it; no drag-to-reorder on the map or list; reorder only within a community.
- **No live GPS**: location is captured once on Arrived and once on Done. No breadcrumb, no live crew map, no geofence auto-arrival.
- On-my-way texts contain no ETA or tracking link (not verified in template text; no ETA source exists in code).
- No per-day route override: nudging a stop changes the standing order for every future day.

---

## 9. Field / mobile view and offline

### What exists
- Installable PWA, phone bottom nav, a one-stop-at-a-time route runner, a full visit page, offline queue for runner actions and photos.

### Depth details
- **Runner** (`src/components/route-runner.tsx`, `/run`): Mine or Everyone for a date; stop card with access/gate/pets/hazards and unverified-driveway warning; Navigate, Call, On my way, Arrived, before/after camera, snow depth, ice melt, Done, Skip with reason; progress bar.
- **Visit page** (`src/app/(owner)/visits/[id]/page.tsx`): the same transitions plus checklist, signature capture, timer, assignees, photos, "Got cash" / "Got e-Transfer" one-tap payment.
- **Offline** (per sub-audit of `route-runner.tsx` and `public/sw.js`): stops cached in `localStorage`; actions queued in `localStorage`, photos in IndexedDB; flush on reconnect, every 30 s and after each action; server endpoint `/api/run` is replay-safe; "No signal, N updates saved" banner.

### Visible gaps
- **No native app**; no push notifications (web push absent).
- **Offline is partial**: the service worker caches page HTML only, not JS/CSS bundles or API data, so a cold start with no signal depends on the browser HTTP cache. No Background Sync, so the page must be open to flush. Checklists, timers, signatures, notes and payments need a connection.
- Queued photos are deleted on any non-5xx response, including an expired-session 401, so they can be lost silently (per sub-audit).
- **Crew see everything**: no restricted crew role, prices and billing are visible, any user can open settings.
- Runner date is a URL parameter with no picker; skip note not available in the runner.

---

## 10. Invoicing and payments

### What exists
- Charge-based invoicing, billing run, custom invoices, deposit invoices, Stripe Checkout, Interac e-Transfer auto-matching with a manual-match queue, receipts, two reminders, partial payments, bad debt, void, account credits (referrals), statements, payment CSV.

### Depth details
- **Model**: `VisitCharge` (created on completion; unbilled until linked to an invoice line), `Invoice` (status `DRAFT`, `AWAITING_PAYMENT`, `PAID`, `BAD_DEBT`, `VOID`; kind standard/deposit; terms on-receipt/7/15/30; subtotal, discount, tax, total, paid; unique `ETC-<number>` e-Transfer reference; reminders sent; allow-partial), `InvoiceLineItem` (service date, job, visit), `Payment` (method, amount, fee, refunded, reference, Stripe ids), `UnmatchedPayment`, `ClientCredit`.
- **Invoice creation paths** (`src/server/ops/invoices.ts`):
  - on Done for per-visit one-off jobs (auto-issued by default);
  - per storm when a storm is finished (drafts);
  - monthly on the 1st at 7am for recurring jobs (drafts);
  - fixed-price job on completion (manual button);
  - billing run: "create drafts for everyone" groups unbilled charges per client (snow per storm), then "send all drafts";
  - custom hand-made invoice.
- **Race safety**: a charge can be linked to only one invoice line; void returns charges to unbilled.
- **Tax** (`invoiceTotals`): single rate (default GST 5%), registered on/off, prices include tax or tax on top.
- **Stripe** (`src/server/stripe.ts`, `/api/stripe/webhook`): Checkout Session created on click for the balance (or a partial amount when allowed); "Pay all" in the hub covers up to 10 invoices with per-invoice allocation; webhook is signature-checked and idempotent; actual Stripe fee is fetched and stored; `charge.refunded` is mirrored into `refundedCents` and the invoice recomputed.
- **Interac** (`src/server/billing/interac*.ts`): inbound bank emails accepted only with a passing, aligned DKIM signature from interac.ca; parses amount, sender, message, reference number; matches by `ETC-n` reference, else unique open invoice with same balance and sender last name; dedupes on Interac reference; non-auto-deposited notices and unmatched payments are escalated to owners.
- **Unmatched queue** (`src/server/ops/unmatched.ts`, `billing/unmatched.ts`): scored suggestions (amount, last name, invoice number in message, email in message), split across up to 3 invoices in the UI, row-locked apply, dismiss with reason.
- **Reminders**: 3 and 10 days past due, 8am-8pm only, per-client opt-out; never more than two.
- **Receipts** emailed for every payment; owners emailed on card payments.
- **Credits**: referral rewards and welcome credits become negative lines on the client's next invoice, each used once.
- **Manual payments**: cash, e-Transfer, cheque, other; collect across several invoices at once; delete a manual payment.

### Visible gaps
- **No card on file, no auto-pay, no subscriptions or recurring billing**, no ACH/pre-authorised debit, no in-person card reader/tap-to-pay. Stripe is Checkout-redirect only.
- **No refunds from the CRM**: refunds must be done in the Stripe dashboard (the webhook mirrors them). No refund for cash/e-Transfer other than deleting the payment. No credit notes.
- **No tips. No late fees or interest. No card surcharge/convenience fee** (README: fees absorbed).
- **Invoices cannot be edited**: no line edits even on drafts, no discount field in use (`discountCents` always 0), no per-invoice due date/terms/message.
- Single tax rate only; no PST/HST, no per-line or per-client tax exemption, no tax report.
- Credits exist only as referral rewards; no UI to issue a manual credit, record an overpayment or hold a deposit on account. Overpayment is rejected.
- Reminder schedule is fixed (2 emails, no SMS reminders, not configurable).
- No statement email or PDF, no real PDF generation anywhere (browser print only), no invoice CSV, no batch print.
- "Send all drafts" has no selection.
- Stripe disputes and failed async payments are not handled.
- Payments page totals are computed from the latest 300 rows only (per sub-audit).
- No accounting sync (see section 15).

---

## 11. Client hub / portal

### What exists
- Passwordless hub at `/hub/[token]`, plus scoped pages for a quote, invoice, visit confirmation, price change, review, photo upload and visit report.

### Depth details
- **Auth** (`src/server/tokens.ts`): 32-byte random link tokens, only the SHA-256 stored; purpose-scoped; expiry and max-use counts; link scanners cannot consume them (GET shows a Continue button, POST uses the token). Hub link request is rate-limited and does not reveal whether an email exists.
- **Hub shows** (`src/app/(public)/hub/[token]/page.tsx`): balance, last 20 payments, printable statement, active snow plans, upcoming visits (date only), last 10 completed visits with shared photos and report links, quotes and invoices, referral link and credit.
- **Hub actions** (`hub/[token]/actions.ts`): pay all open invoices by card, pause/resume snow plan, renew plan for next season, toggle SMS updates, send a free-text work request.
- **Visit report** `/v/[token]`: finish time, depth, ice melt, signature, client-visible checklist answers, before/after photos.

### Visible gaps
- No editing of contact details or addresses; requests always attach to the default property.
- No saved payment methods, auto-pay or wallet.
- No reschedule/cancel from the hub (only via the emailed confirm link, free text).
- No message thread with the business; no document library; no PDF downloads.
- No structured new-work request (service picker, date, photos).
- No hub branding/settings; no password or 2FA option (link-possession only).

---

## 12. Messaging and marketing

### What exists
- Two-way SMS/MMS with RCS when available, transactional email and SMS templates, email and SMS campaigns with CASL consent logic, review requests, referral program.

### Depth details
- **Texting** (`src/server/sms.ts`, `src/server/ops/texts.ts`, Telnyx): shared inbox with unread counts and search; threads for unknown numbers with link-to-client or create-client; MMS in and out (up to 5 images, background download with retry); RCS with tap-to-reply buttons and automatic SMS fallback; delivery receipts; STOP/START/HELP handling mirrored locally; segment counter; file MMS photos onto a job or quote; owner email on new inbound text (throttled to one per 15 minutes per conversation per README). Polls every 8 s for refresh.
- **Transactional emails** (`src/server/email/templates.tsx`, `src/emails/*`): booking confirmation, photo request, quote sent / follow-up / approved, visit scheduled / reminder / on my way / done, storm heads-up, invoice sent / reminder 1 and 2, payment receipt, review request, plan renewal, price change, hub link; owner: login, new booking, notice, payment received, photos uploaded, snow alert, daily digest.
- **SMS templates** (`src/server/email/sms-templates.ts`): opt-in, on my way, visit reminder, visit done, storm heads-up, review request, referral thanks, price change, campaign.
- **Campaigns** (`src/server/ops/campaigns.ts`): email block editor (heading, text, button, divider, `{first_name}`) or SMS; audience filters (lead/active/past, tags, communities, service text, last-visit before/after, has snow plan, has open quote) with live count; CASL consent (express, or implied by purchase within 2 years / inquiry within 6 months); SMS quiet hours 9pm-9am; pacing under the daily email cap across days; signed unsubscribe (one-click compatible), open pixel and click redirect; test send; schedule for later.
- **Reviews** (`src/server/ops/marketing.ts`): rating-first page; 4-5 stars go to Google with click tracking, 1-3 go to private feedback (pinned note + owner email); sent a configurable number of hours after a completed visit, once per client per ~180 days, SMS preferred.
- **Referrals**: per-client share code and link; referee linked on booking; referral qualifies on the referee's first paid invoice; referrer credit and optional referee welcome credit; thank-you SMS/email; status pending -> qualified -> rewarded.

### Visible gaps
- **Templates are not editable**: all email and SMS wording is in code; `EmailTemplateOverride` is unused. No logo/branding settings.
- No two-way email inbox; no email composer for one-off emails to a client.
- Inbox has no assignment, internal comments, snooze, saved replies management (four hard-coded quick replies), or scheduled send. No voice features beyond call logging.
- Campaigns: no automated/drip sequences, no trigger-based campaigns (win-back, seasonal re-engagement), no A/B, no revenue attribution, no duplicate/delete/cancel once scheduled, no template gallery, no image blocks.
- Review flow is review-gating to Google only; no review monitoring, reply or display widget; no Facebook or other sites.
- Bounce and complaint handling is absent (no inbound provider webhooks).
- Single shared business number; no per-user numbers or masked calling.

---

## 13. Reports and dashboards

### What exists
- Home dashboard with workflow cards and to-dos; one fixed Reports page; three CSV exports.

### Depth details
- **Home** (`src/app/(owner)/page.tsx`): request/quote/job/invoice workflow cards with counts and dollar totals, today's appointments with per-person progress, 11 to-do counters, receivables with top three debtors, visits next 7 days, collected this month, snow banner (live storm progress or 3-day forecast with number of plans that would trigger).
- **Reports** (`src/app/(owner)/reports/page.tsx`): money in (12 months, by month), visits done, quote approval rate, storms this season, hours by person (30 days), profit by job (90 days, top 15), invoiced by service (top 10), money in by community (top 10), storm table.
- **Exports**: payments (year), expenses (month), storm report.
- **Daily digest** email at 6am (optional).

### Visible gaps
- No date pickers, filters, drill-down, saved reports or scheduled reports.
- Missing standard reports: aged receivables, tax collected, client balances, lead source/conversion funnel, recurring revenue, timesheet/payroll, salesperson, visits by status, property/route profitability.
- No CSV for clients, jobs, quotes, invoices, time entries.

---

## 14. Team, timesheets, payroll

### What exists
- Team list with colour and hourly cost, weekly working hours, time off, timesheets week grid.

### Depth details
- `User`: email, name, phone, calendar colour, `hourlyCostCents`, `workHours`, active. Passwordless email-link sign-in (20-minute single-use link), 30-day sliding sessions (`src/server/auth.ts`).
- Timesheets (`src/app/(owner)/timesheets/page.tsx`): week grid per person, edit minutes/note, add manual time, delete.

### Visible gaps
- **No roles or permissions** (see section 0). Any active user is a full admin.
- No invites/onboarding, no 2FA/SSO, no audit of sign-ins beyond `lastLoginAt`.
- No payroll: no pay rates distinct from cost, no overtime, no pay periods, no approval, no export.
- No crews/teams, skills, certifications, or per-user notification preferences. Owner alerts go to the env-configured `OWNER_EMAILS`, not to assigned staff.
- No general clock-in/out or GPS-stamped time.

---

## 15. Automations, integrations, settings

### What exists
- Eleven on/off automations, inbound integrations for payments and messaging, a public JSON feed for the marketing site, a small settings page.

### Depth details
- **Automation switches** (`src/server/settings.ts`): all-done email, invoice per-visit jobs on Done, on-my-way email, storm heads-up, snow alert to owners, partial payments, Google review requests, 6am digest, quote follow-up, visit reminders, text updates. Plus numeric: review delay hours, referral reward, referee discount.
- **Always-on automations** (`src/server/scheduler.ts`): invoice reminders, monthly recurring invoices, recurring visit generation, Telnyx call sync, MMS retry, texts-failing alert to owners.
- **Integrations**: Stripe (Checkout + webhook), Telnyx (SMS/MMS/RCS + webhook + call records), Interac via Cloudflare Email Worker, MET Norway forecast, Google Places autocomplete and Maps links, OpenStreetMap tiles, SMTP (Brevo).
- **Outbound**: `/api/public/site` JSON feed (tuition tracker totals and consented before/after gallery).
- **Settings** (`src/app/(owner)/settings/page.tsx`): business identity, depot, GST and terms, seasons, price-book prices, read-only service area; team; checklist templates.

### Visible gaps
- **No workflow builder**: triggers, delays, conditions and message content are fixed in code.
- **No accounting integration** (no QuickBooks, Xero, Sage), no bank feeds.
- **No calendar sync**, no Zapier/Make, no outbound webhooks, no public API or API keys.
- No branding (logo, colours), numbering, business hours, service-area editing, community order editing, reminder timing, or template editing in Settings.
- Stripe/Telnyx configuration is env-var only; no in-app connect flow.

---

## 16. Tests and reliability tooling (brief)

- **Unit tests** (`tests/unit/*`, Vitest, 15 files): pure logic for booking validation/estimates, slots, driveway pricing, money, dates/DST, tokens, rate limit, invoice totals/status/reminders, quote transitions, deposits, ledger, Interac parsing/matching/DKIM, Telnyx signature/RCS/segments, recurrence, route ordering and split, forecast, visit transitions and charges, checklists, signatures, job profit, search parsing, health verdict.
- **Integration** (`tests/integration/booking-flow.test.ts`): one DB-backed flow, booking -> size check -> price OK -> on route -> completed.
- **Not covered**: no browser/e2e tests, no component tests, no HTTP-level tests of route handlers, webhooks, hub, quote/invoice pages or the offline queue.
- **CI** (`.github/workflows/ci.yml`): Postgres 17, migrate, seed, typecheck, lint, tests, build. No deploy step.
- **Monitoring** (`.github/workflows/monitor.yml`, `scripts/smoke.sh`): 9 read-only curl checks every 10 minutes; alert is GitHub's failure email.
- **Health** (`src/server/health.ts`, `/api/healthz`): DB and scheduler heartbeat (503), email/SMS failure counts (soft).
- **Backups** (`scripts/unraid-backup.sh`): copies nightly dump, verifies age/size/restore listing, 30-day retention, media rsync, weekly full test restore.
- **Resilience patterns in code**: transactional outbox with `SKIP LOCKED`, dedupe keys on every automation, advisory locks for hourly jobs, idempotent webhooks, replay-safe field actions.

---

## Summary table

| Area | Depth (1 = stub, 5 = deep) | One-line reason |
|---|---|---|
| Snow storms and plans | 5 | Full storm lifecycle, triggers, pushes, forecast, proof report, size/price approval |
| e-Transfer and payment matching | 5 | DKIM-verified ingestion, auto-match, scored manual queue, splits |
| Texting (SMS/MMS/RCS) | 4 | Two-way, media, RCS fallback, opt-out; no templates editing or assignment |
| Quote approval flow | 4 | Optional lines, signature evidence, deposits; no templates/options/tax |
| Scheduling | 4 | Calendar DnD, conflicts, find-a-time, team board; no resource view or sync |
| Invoicing core | 4 | Charge-based, many triggers, credits, partials; no editing, refunds, fees |
| Campaigns/reviews/referrals | 3-4 | CASL logic and tracking; no drip automations |
| Client hub | 3 | Pay, pause/renew, request; no profile, wallet, reschedule |
| Jobs and costing | 3 | Good completion logic; jobs not editable, thin recurring |
| Field/offline | 3 | Runner with queue; HTML-only service worker, no push |
| Routes | 2-3 | Standing haversine order by community; no drive time, ETA, vehicles, live GPS |
| Clients/CRM | 3 | Rich contact model; no custom fields, import/export, merge, pipeline |
| Reports | 2 | One fixed page, three CSVs |
| Online booking (`/book` in app) | 2-3 | API is solid; in-app form lacks slots, autocomplete, referral |
| Price book | 2 | Seeded list; only price and active are editable |
| Team/permissions/payroll | 1-2 | No roles enforced, no payroll |
| Automations builder | 1 | Fixed toggles only |
| Integrations (accounting, calendar, API) | 1 | None beyond Stripe, Telnyx, Interac email |
| Ordering/inventory/POs/suppliers | 0-1 | Only an expenses table |
