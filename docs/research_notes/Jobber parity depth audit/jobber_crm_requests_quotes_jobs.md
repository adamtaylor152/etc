# Jobber CRM, Requests, Quotes, Jobs, Catalogue — depth audit (as of Nov 2026)

Scope note: findings come from help.getjobber.com articles and getjobber.com/pricing-plans read on 2026-11-27/28. Most pages were read through an automated page summariser, so wording is paraphrased; where a page said "select plans" without naming them, that is reported as-is. Prices are USD from the US pricing page (no Canadian-dollar page was retrieved). The developer GraphQL schema could not be read (developer.getjobber.com returned 403; schema enums are only browsable in GraphiQL behind login), so status names below are the UI/help-centre names, not API enum values.

## Clients: client vs. lead, contacts, properties, billing, tags, custom fields, notes, balance, comms, merge, import/export, lead source, pipeline

### Takeaway
Jobber's "lead" is not a separate object: it is an automatic, one-way label on a client record that drops off at the first job, sent invoice or approved quote. The depth lies in (a) multi-contact/multi-property records with per-contact communication preferences, (b) typed custom fields with forward-only "transferable" behaviour, (c) lead-source attribution incl. UTM capture and reports, (d) a real merge tool (Aug 2026), and (e) a separate paid Sales Pipeline kanban (Plus or US$49/mo add-on) with auto-moving cards, tasks and won/lost reporting.

### Cited Findings

**Lead vs. client**
- A "lead" label shows in the client list, requests list and client profile; available on all plans. — [Lead management](https://help.getjobber.com/en/articles/lead-management/)
- The label is removed when a job is created for the client, an invoice is sent, or their quote is approved; once removed "it is not possible to remark this client as a lead." — [Lead management](https://help.getjobber.com/en/articles/lead-management/)
- CSV-imported clients and integration-created clients are created as clients, not leads. Clients who submit a request form are added to the client list as leads. — [Lead management](https://help.getjobber.com/en/articles/lead-management/); [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Client list metrics: new leads (last 30 days), new clients (last 30 days), new clients YTD; filter by tags or status (Leads / Active / Archived), sort by name or last activity, bulk actions (incl. bulk tag add/remove and bulk delete). — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Lead status syncs to Mailchimp as an "Is Lead?" field for segmenting. — [Lead management](https://help.getjobber.com/en/articles/lead-management/)

**Client record fields**
- Primary contact: first/last name, company name, optional title (Mr., Mrs., Ms., Miss., Dr.), phone(s), email(s). Additional phones/emails added with "+", each typed Main / Work / Personal. Each phone has a "Receives messages" (text-enabled) toggle; only the primary number is texted by default. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Import supports an "Is Company?" TRUE/FALSE column (commercial vs. residential). — [Import clients](https://help.getjobber.com/es/articles/import-clients/)
- Per-client communication settings (toggles for automated messages): outstanding quote follow-ups, overdue invoice follow-ups, upcoming assessment/visit reminders, job closure follow-ups, review requests (reviews add-on). — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Additional contacts: role (e.g. tenant, family member), first/last name, phone, email, own communication settings, and a "Set as billing contact" checkbox. Billing contacts' emails pre-populate on quotes and invoices (incl. batch invoicing) and can receive payment receipts. Additional contacts get client hub access. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)

**Properties and billing address**
- A client can have zero, one or many properties. Each has Street 1/2, city, state/province, postal code, country (Google Maps autocomplete), a property contact section, its own tax rate, and property-level custom fields. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Tax default order on a job: converted quote's tax/discount, else the property's tax rate, else the account default tax rate. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- A billing address separate from property addresses exists (import columns: billing street, city, province/state, postal code, country; editable from the client profile / app). — [Import clients](https://help.getjobber.com/es/articles/import-clients/); [Client information in the Jobber app](https://help.getjobber.com/en/articles/client-information-in-the-jobber-app/)
- A request's property can only be changed on Jobber.com (not the app) and only to another property of the same client. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)

**Tags**
- Tags group/filter clients; edited individually or in bulk from the client list. They are usable as automation conditions ("client tag includes / does not include") and as an automation action ("add tag"). — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867); [Custom automation builder](https://help.getjobber.com/en/articles/custom-automation-builder/)

**Custom fields**
- Plan: Connect, Grow, Plus (not Core). — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Apply to: clients, properties, quotes, jobs, invoices, team members (one object type per field). — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Value types: True/False (checkbox), Numeric, Area (length x width), Drop Down (defined options), Text. Optional account-wide default value. Type cannot be changed after creation. — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Transferable fields: chosen at creation only; data flows forward only (quote -> job -> invoice), never backward; cannot later be made non-transferable; edited/deleted only from the object they were created on. — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Internal by default; made client-facing per document type (quote/job/invoice PDFs) under Business Profile > Client Document Settings > "Select fields to display". App-created and archived fields cannot be client-facing. — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Archive (hides on new items, keeps on old, reversible) vs. delete (permanently removes data). Drag-reorder. Blank numeric/area/text fields are hidden on the view page. Custom fields are available as report columns. More than 50 fields "may cause performance issues". — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Connected apps can add their own custom-field sections (display or input); they auto-archive when the app is disconnected. — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Sales Pipeline search does not search custom field values. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)

**Notes, attachments, files**
- Internal notes and file attachments live in the right sidebar of the client, request, quote and job pages; visible to the team only. Attachments can be sent with emails. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867); [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- "Files and media" gallery on the client (all files from that client's checklists and notes, filter by source/type/date, shows where/when/who added) requires Plus or the Marketing Suite add-on. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867); [The Plus plan](https://help.getjobber.com/en/articles/the-plus-plan/)
- Plus-only: @mention teammates in notes (notification + mentions feed) and image markup (draw/shapes/text) on photos in notes, quotes, requests, checklists and expenses. — [The Plus plan](https://help.getjobber.com/en/articles/the-plus-plan/)
- Signed PDFs from collected signatures and the pre-edit version of an approved quote are stored as internal notes. — [Job basics](https://help.getjobber.com/en/articles/job-basics/); [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)

**Balance, billing history, statements**
- Client overview shows Lifetime value and Current balance; Billing tab lists invoices, payments, deposits and balance; Payment methods tab shows saved cards. Payments recorded from the profile are non-card methods only. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Positive balance = client owes; negative = credit/overpayment; tips are excluded from balance. A statement of account can be generated from the billing history on Jobber.com. — [Client billing history](https://help.getjobber.com/es/articles/client-billing-history/)
- Unapplied deposits sit in the client's account balance and can be applied to any invoice for that client; voiding an invoice returns its deposit to the balance. — [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- Opening "account balance" can be imported per client via CSV. — [Import clients](https://help.getjobber.com/es/articles/import-clients/)
- A Client Balance Summary report lists clients owing and clients in credit. — [Client balance summary report](https://help.getjobber.com/en/articles/client-balance-summary-report/)

**Communications log**
- Client sidebar shows last communication; a Communication tab shows emails and two-way text threads (all plans for the tab; two-way SMS itself is "select plans" — pricing page lists it under Grow). A Client Communications report shows sent emails incl. when quotes were opened. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867); [Quote basics](https://help.getjobber.com/en/articles/quote-basics/); [Pricing](https://getjobber.com/pricing-plans/)

**Archive / delete / merge**
- Archive keeps records and client hub access; delete is permanent and removes all the client's requests, quotes, jobs and invoices. — [Client basics](https://help.getjobber.com/hc/en-us/articles/115009450867)
- Merge duplicate clients: all plans, Jobber Online only (not the app); one duplicate into one primary at a time; requires the "View, edit, and delete full client and property info" permission; cannot be undone. — [Merge duplicate clients](https://help.getjobber.com/es/articles/merge-duplicate-clients/)
- Transfers to primary: jobs, visits, quotes, requests, invoices, statements, properties (each job/quote keeps its original property), conversations, notes, marketing emails, call records, contact details, tags, custom fields. Conflicts: primary wins; blanks on primary are filled from secondary; emails, phones, tags and list-type custom fields are unioned and de-duplicated. — [Merge duplicate clients](https://help.getjobber.com/es/articles/merge-duplicate-clients/)
- Never transfers: saved cards / payment methods / ACH consent, and the secondary's client hub login. Blocked when: unsettled payment authorisation, another merge or an accounting sync in progress, or referral credits attached. Merging does not merge the matching record in QuickBooks/Xero/Mailchimp. Duplicate properties can be merged separately afterwards. — [Merge duplicate clients](https://help.getjobber.com/es/articles/merge-duplicate-clients/)
- The merge feature was announced in a product update titled "Merge duplicate clients and properties" (search result dated it August 2026). — [Product update](https://productupdates.getjobber.com/154904-merge-duplicate-clients-and-properties)
- No automatic duplicate detection is documented; stated causes of duplicates are re-entered request forms, Receptionist phone mismatches, and accounting/Zapier syncs. — [Merge duplicate clients](https://help.getjobber.com/es/articles/merge-duplicate-clients/)

**Import / export**
- Import accepts CSV/TSV/PSV under 2.5 MB (~5,000 rows); admin only; cannot be run in a private-browsing window. — [Import clients](https://help.getjobber.com/es/articles/import-clients/)
- Importable columns: name parts/title, company + Is Company?, phones (main, home, work, mobile, fax, other, text-enabled number), multiple emails (comma-separated in one cell), property address, billing address, notification preferences (visit reminders, job follow-ups, quote follow-ups, invoice follow-ups), account balance, archived status, notes, tags, lead source (default sources only — custom lead sources cannot be imported). — [Import clients](https://help.getjobber.com/es/articles/import-clients/)
- Multiple properties = one row per property repeating the client details. Re-importing an export with its J_ID column bulk-updates existing clients (tags, archived, notification prefs). Only text custom fields import; unmatched columns can become new text custom fields. — [Import clients](https://help.getjobber.com/es/articles/import-clients/)
- Export as CSV or vCard, full or partial. — [Import clients](https://help.getjobber.com/es/articles/import-clients/)

**Lead source tracking**
- Lead Source dropdown on the client form; defaults: Referral, Google, Facebook, Instagram, Flyer, Vehicle wrap, Event, Other; custom sources via "Create New" (up to 100 total); can be renamed/removed. — [Lead management](https://help.getjobber.com/en/articles/lead-management/)
- UTM parameters (source, medium, campaign, term, content) on request/online-booking links are captured and utm_source auto-fills lead source. The request form question "How did you hear about us" maps to lead source. — [Lead management](https://help.getjobber.com/en/articles/lead-management/); [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Integration-created clients get the integration name as a non-editable lead source (Angi Leads, Thumbtack, CallRail, etc.); QuickBooks/Zapier-synced clients do not. — [Lead management](https://help.getjobber.com/en/articles/lead-management/)
- Reports: Clients report (lead source, UTM data, quotes sent, jobs booked, conversion), Lead source report (clients, quotes, jobs, revenue and conversion per source for a period), Client Contact Info report ("Lead (as of today's date)" Yes/No). — [Lead management](https://help.getjobber.com/en/articles/lead-management/)

**Sales Pipeline (kanban)**
- Plan: Plus, or "Pipeline" add-on on Core/Connect/Grow; add-on listed at US$49/mo. Non-admins need a Pipeline permission (which presupposes edit-everyone's-schedule, requests/quotes create/edit, pricing and reports). — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023); [Pricing](https://getjobber.com/pricing-plans/)
- Built-in stages: New Request, Assessment Unscheduled, Assessment Scheduled, Assessment Completed, Draft Quote, Awaiting Response, Changes Requested; then Closed Won / Closed Lost (leave the board, shown on a Sales Outcomes report). — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- Each request and each quote is its own opportunity card (client name, created date, $ value for quotes). Freshness chips: green < 1 hour old, red > 24 hours. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- Cards auto-advance on normal Jobber actions (schedule/complete assessment, convert to quote, send quote, approve). Won is automatic on quote approval or job creation. Lost is manual with an optional lost reason and archives the underlying request/quote. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- Drag-and-drop into a built-in stage triggers the matching action (prompt to schedule assessment, create quote, send quote...); backward moves unsupported. Up to 25 custom stages, placeable between built-ins; custom stages trigger no automations. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- One salesperson per opportunity (inherits from request/quote). Tasks per opportunity (title, instructions, owner, due date; max 5 open + 5 completed; web-only; dated tasks appear on assignee's schedule). Notes from the Opportunity Brief panel. Filters: salesperson, date created; sort by time in stage, created date, value. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- Quote archive reasons (single-select, optional): competitor chosen, no longer needed, unresponsive customer, postponed, price too high, scheduling conflict, scope/service mismatch, trust or credibility concerns. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)

### Inferences
- For a small snow/yard crew the parity-critical depth is: one-way automatic lead->client transition; multiple typed phones/emails with per-number SMS opt; additional contacts with a billing-contact flag; multiple properties each with own tax rate and custom fields; lead source with UTM capture; and per-client automated-message opt-outs. A basic CRM with a single phone/email/address per client is missing all of these.
- Jobber's "segments" are thin outside the Marketing Suite: the client list itself filters only by tag and status. Richer segmentation lives in Campaigns (Marketing Suite / Plus).
- The quote archive-reason list likely doubles as the Pipeline "lost reason" list (the Pipeline article says marking Lost archives the quote but does not enumerate reasons) — unconfirmed.

### Gaps
- GraphQL field names/enums for Client, Property, CustomField could not be retrieved (developer.getjobber.com 403).
- No documented automatic duplicate detection or "possible duplicate" warning was found.
- The exact contents of client statements (date range options, format) were not read in full.
- No dedicated help article for client list "segments" beyond tag/status filters was found.

## Requests: online booking vs. request form, form questions, service selection, availability rules, assessments, statuses, conversion, booking settings, AI receptionist

### Takeaway
Jobber has one form builder with three mutually exclusive form types — request form, assessment booking, job booking — on all plans. Booking forms add service selection with price/duration/quantity, random auto-assignment among available team members, and a choice of drive-time limit, fixed buffer or no restriction. Requests carry nine statuses driven mostly by the assessment's state. The AI Receptionist (Plus, or US$99/mo add-on; available in Canada) creates requests and bookings through those same forms and settings.

### Cited Findings

**Form types and builder**
- Three form types, one per form: Request form (creates a Request for review), Assessment booking (creates a Request + schedules an assessment), Job booking (auto-converts the Request and schedules a one-off job). Offering both bookable assessments and jobs requires separate forms. Available on all plans; admin-only settings. — [Online booking](https://help.getjobber.com/en/articles/online-booking/); [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Multiple forms, each with its own share link/embed code/QR use; one "default" form used for internal requests, client hub, the WordPress plugin and referral links. Per-form menu: Edit, Preview, Share links, Add tracking (GA4 "form_submit"), Set as default, Delete. — [Requests and bookings settings](https://help.getjobber.com/es/articles/requests-and-bookings-settings/)
- Forms are built from sections and questions; paginated by default (progress bar, Next/Back), can be single-page; a review screen precedes submit; confirmation = custom title/description or redirect to a custom URL (not on embedded forms). Client gets an email copy. — [Request basics](https://help.getjobber.com/en/articles/request-basics/); [Requests and bookings settings](https://help.getjobber.com/es/articles/requests-and-bookings-settings/)
- Required: first+last name or company name, and at least one of email/phone. Email and phone fields carry non-removable marketing/transactional consent checkboxes. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Question types: street address; "How did you hear about us" (maps to lead source, options customisable); short answer; long answer; dropdown (single or multi); checkbox; radio; numerical; image upload; area (length x width + unit); yes/no toggle; date picker. Any question can be marked required. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- "Actions" that can be added to a form: Add products and services; Add payment method (card only, requires Jobber Payments, not shown on embedded forms, card saved to client profile); Add assessment; Add job booking. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Uploads: request form up to 10 files, <10 MB each, JPEG/PNG/HEIC; booking flow up to 4 files, <10 MB each / 40 MB total, JPEG/PNG/HEIC/PDF. Uploaded files land as an internal note; client notes go into the appointment's Instructions. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)

**Service selection (bookable services)**
- Each bookable service has price and duration shown to the client, assigned team members, and a flag for bookable as assessment or as job. Duration 15 min to 12 h. Optional client quantity selection with min/max; price and duration scale with quantity. Up to 100 services shown. Service images are not shown in booking. — [Online booking](https://help.getjobber.com/en/articles/online-booking/); [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- If a client selects a mix of assessment-type and job-type services, the whole booking becomes an assessment. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)

**Availability rules / booking settings**
- Earliest availability (minimum lead time, e.g. one business day blocks same-day), booking interval (slot increments from business-hours start, e.g. every 30 min). Business hours come from Company Settings; per-team-member availability (weekday, start/end) from Manage Team. — [Online booking](https://help.getjobber.com/en/articles/online-booking/); [Requests and bookings settings](https://help.getjobber.com/es/articles/requests-and-bookings-settings/)
- "Efficient scheduling" — pick one: Drive time limit (only offers slots within a max drive time of that day's other bookings; needs client address; uses historical traffic via TravelTime; available in US, Canada, UK, Australia), Fixed buffer time between all appointments, or No time restrictions. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)
- Drive-time edge cases: resets at local midnight; if no appointments exist that day, all slots show regardless of location; only team members within the max drive time are assigned. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)
- Service area: per-form toggle (off by default); client enters postal/zip code first; outside-area clients are told to contact the business. The area itself (radius) is defined in Company Settings. — [Online booking](https://help.getjobber.com/en/articles/online-booking/); [Requests and bookings settings](https://help.getjobber.com/es/articles/requests-and-bookings-settings/)
- Team assignment is automatic and random among available members; time off must be blocked with a Task assigned to the person (calendar Events do not block booking). — [Online booking](https://help.getjobber.com/en/articles/online-booking/)
- Assessment booking forms have "Require assessment booking approval" (on by default): booking arrives as a request in "Needs approval"; Accept and Schedule sends confirmation; reject via Mark as Lost (web) / Decline (app). Job booking forms have no approval step documented. — [Request basics](https://help.getjobber.com/en/articles/request-basics/); [Requests and bookings settings](https://help.getjobber.com/es/articles/requests-and-bookings-settings/)
- Notifications: admins get activity-feed + email (time, team, summary, View Booking); client gets confirmation screen + email; client hub shows date, arrival time, duration, address, services, cost, team. Online-booked items carry an icon on schedule/jobs list/app; the one-off jobs report flags online-booked jobs. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)
- Google Business Profile booking link and GA4 tracking are supported. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)

**Internal requests and assessments**
- Internal request fields: title, client, requested date, referral source, form answers, product/service line items, on-site assessment (instructions, start/end date or "Schedule later", start/end time or "Anytime", team). Internal requests are not visible in client hub. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Requests can carry line items, one photo per line item (shown to client in client hub and carried to the quote/job on conversion). — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Checklists can be attached to assessments (and auto-attached to all new assessments). — [Checklists](https://help.getjobber.com/en/articles/checklists/)
- Request history panel: created/updated/deleted events with before/after values, filter by team, type, date. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)

**Statuses**
- New; Needs approval; Unscheduled (assessment required, not scheduled); Today; Upcoming; Overdue (assessment date passed, not completed); Assessment complete; Converted (final — became quote or job); Archived (final — not visible to clients). — [Request basics](https://help.getjobber.com/en/articles/request-basics/)
- Requests list metrics: new requests last 30 days and 30-day conversion rate; Requests report filterable by date, status, client. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)

**Conversion**
- Convert to quote or to job from the request's More menu; line items and their images carry over; client stays the same. Quote templates can be picked when converting a request. — [Request basics](https://help.getjobber.com/en/articles/request-basics/); [Quote templates](https://help.getjobber.com/en/articles/quote-templates/)

**AI Receptionist**
- Included with Plus (unlimited conversations); add-on on Core/Connect/Grow at US$99/mo incl. 100 conversations per cycle, US$0.79 each beyond (or auto-pause at the cap). Available in US, Canada and UK; requires a Jobber dedicated phone number (existing numbers can forward to it). — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/); [Pricing](https://getjobber.com/pricing-plans/)
- Handles calls and texts 24/7, concurrent calls: answers business questions, creates work requests using a selected request form, schedules jobs using Online Booking settings (bookable services + team), looks up upcoming visits, adds notes, reschedules (needs online booking) and cancels visits (visit becomes unscheduled with a cancellation note), takes messages, creates follow-up tasks (assigned to admins by default, same day or next day if after hours). — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- Matches caller ID to an existing client; known-caller greeting can mention their upcoming appointment. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/); [Product update](https://productupdates.getjobber.com/121638-receptionist-now-does-more-to-assist-your-existing-clients)
- Settings: separate business-hours/after-hours greetings and phone menus; tone (Casual/Professional/Brief); voice choice; background noise; optional 10-second answer delay; text greeting (300 chars); SMS send-back to callers who hang up; escalation policy (trigger words -> text with transcript snippet or live call transfer). Knowledge sources: company settings, business profile, Jobber website FAQs. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- Dashboard tags per conversation: General inquiry, Needs action, Request created, Assessment scheduled, Job scheduled, Took a message, Spam, Call escalated; each with summary, recording, transcript. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- The Plus plan article still labels AI Receptionist "(Beta)". — [The Plus plan](https://help.getjobber.com/en/articles/the-plus-plan/)

### Inferences
- "Online booking" in Jobber is not a separate module; it is a request form with a booking action, so every booking still produces a Request record (auto-converted for job bookings). A parity build should model booking as request + auto-conversion to keep lead/conversion reporting consistent.
- For snow removal in Calgary, drive-time-limited slots (TravelTime covers Canada) and postal-code service-area gating are the high-value booking rules; fixed buffer is the simple fallback.

### Gaps
- No setting for "latest booking / how far in advance clients can book" was found in the articles read; it may exist in the UI.
- No documented client self-service reschedule/cancel of online bookings via client hub was found (only via Receptionist).
- No deposit/prepayment at booking is documented — only saving a card on file.
- How the service-area radius is defined (km, polygon, postal list) was not in the pages read.

## Quotes: line items, optional items, options/packages, images, markup/margin, deposits, approval + signature, change requests, follow-ups, templates, statuses, expiry, discounts, taxes, conversion, reports

### Takeaway
Quotes have six statuses (Draft, Awaiting Response, Changes Requested, Approved, Converted, Archived) with strict one-way rules, client-hub approval with optional signature and one-step "Approve & Pay Deposit", deposits or multi-installment payment schedules, and plan-gated upsell tooling (optional line items, line images, markup/margin on Grow+; "Options" sets of 2–5 choices). No quote expiry/valid-until feature is documented; stale quotes are handled by follow-ups and auto-archive automations.

### Cited Findings

**Structure and line items**
- Only a client is required to save. Optional: internal title (never shown to clients, carries to the job), salesperson (carries to jobs and invoices; feeds a salesperson performance report), quote custom fields. Quote number is digits only. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Line item fields: name (required), description, quantity (required), unit cost, unit price, total; from the Products & Services list or custom; drag to reorder; max 100 per quote. Typing an unknown name offers to add it to the catalogue. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/); [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- Text-only lines (no qty/price) for intros, scope, warranty, package explanations. AI "Rewrite" on descriptions and client message with four tones (cheerful, casual, professional, shorter). — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/); [Quoting on the Grow plan](https://help.getjobber.com/en/articles/quoting-on-the-grow-plan/)
- "Client view" toggles control whether the client sees quantities, unit prices, line totals and totals. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Contract/disclaimer text defaults from Client Document Settings, overridable per quote, with "Apply to all future quotes". — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)

**Optional line items (Grow, Plus)**
- Any line can be "Mark as optional"; optionally pre-selected ("recommended"), which the client can deselect. Client toggles options in client hub and the total updates live. Labels: "Optional" (selected, included) vs "Not included" (greyed on PDF). A percentage deposit recalculates on the selected total. — [Optional line items on quotes](https://help.getjobber.com/es/articles/optional-line-items-on-quotes/)
- On conversion to job, selected optional items become normal line items and unselected ones are dropped; each keeps quoted price, quantity and cost. — [Optional line items on quotes](https://help.getjobber.com/es/articles/optional-line-items-on-quotes/)

**Options / packages**
- "Quote Options" (beta article): an option set is a group of 2–5 alternative line items of which the client must pick one before approving (materials, good/better/best); up to 3 option sets per quote; web (Jobber.com) only; not reflected on quote PDFs while in lab/beta. — [Quotes Options Beta (search snippet; article URL returned 404 on direct fetch)](https://help.getjobber.com/hc/en-us/articles/33970469537047-Quotes-Options-Beta)
- Before Options, packages were built by making every line optional (gold/silver/bronze). — [Optional line items on quotes](https://help.getjobber.com/es/articles/optional-line-items-on-quotes/)

**Images, markup, margin (Grow+)**
- Line item images (uploaded, or reused from the Files & Media library on Plus/Marketing Suite) show beside the line in client hub, not on PDFs. — [Quoting on the Grow plan](https://help.getjobber.com/en/articles/quoting-on-the-grow-plan/); [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- Markup: percentage on unit cost to derive unit price; estimated margin shown to the business only; cost never shown to clients. — [Quoting on the Grow plan](https://help.getjobber.com/en/articles/quoting-on-the-grow-plan/)
- "Advanced Quote Customization" (select plans) adds quote sections: introduction with header image, attachments, images, reviews (needs reviews add-on), footer text/image. — [Quote templates](https://help.getjobber.com/en/articles/quote-templates/)

**Discounts and taxes**
- Discount as $ or %; carries to the job and to invoices from that job. Tax rate editable per quote without altering account default. Individual catalogue items can be "exempt from tax". — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/); [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)

**Deposits and payment schedules**
- "Add Deposit or Payment Schedule": single deposit as % of total or fixed $; or a payment schedule splitting the total into named installments (% or $, must sum to 100%), first one optionally the required deposit. — [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- Collected via client hub (Approve & Pay Deposit), "Collect Deposit" on web (or "Record Deposit" without Jobber Payments), or in the app (saved card, new card, Tap to Pay, card reader, or offline methods incl. cash, cheque, bank transfer, E-Transfer (Canada only), Other). No partial deposit payments via client hub. — [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- Converted job shows Required / Collected / Outstanding deposit; the deposit auto-applies to the invoice generated from that job. Offline deposits can be edited/deleted; Jobber Payments deposits cannot. — [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- Optional setting to require a saved payment method at approval (card and ACH / card only / ACH only), enabling automatic payments after conversion. — [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- ACH bank payments are listed as US only on the pricing page. — [Pricing](https://getjobber.com/pricing-plans/)

**Approval, signature, change requests**
- Email button is "Review & Pay Deposit" (deposit via Jobber Payments) or "View Quote". Text links expire after 24 h; client can still enter with the last 4 digits of their phone. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)
- Client hub settings: Require client signatures (draw or type); Clients can request changes; menu visibility for Quotes/Invoices; show scheduled time. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)
- On approval: status -> Approved, signature saved as internal note, client gets an editable approval email, admins get activity-feed + push notification. Manual "Mark as Approved" exists for verbal approvals; in-person "Collect Signature" on the quote. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008); [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Request Changes: client types a message; status -> Changes Requested; the quote is hidden from client hub until amended and re-sent or marked Awaiting Response. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)
- Editing an Approved quote's total, deposit, line items, client message, contract/disclaimer or number removes the client signature (after an "I understand" checkbox); the prior signed version is saved as a PDF note; the quote stays Approved. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)

**Statuses**
- Draft (internal only; cannot return to draft once sent) -> Awaiting Response -> Changes Requested / Approved -> Converted (final; stays even if the job is deleted) ; Archived (hidden from client hub; drafts cannot be archived directly). — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Save options: save draft, save and email, save and text, save and convert to job, save and mark awaiting response. "Create Similar Quote" copies line items, message, client view, title, disclaimer, deposits, discounts. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Per-quote activity/history panel with before/after values, filter by team/type/date. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)

**Follow-ups and automations**
- Quote follow-ups (select plans; pricing page lists "automated quote and invoice follow-ups" under Connect): automatic reminders sent by the same channel as the quote after a set number of days; editable wording and schedule under Settings > Emails & Text Messages; per-client opt-out. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008); [Pricing](https://getjobber.com/pricing-plans/)
- Quote reminders (all plans): internal calendar reminders assigned to the quote's creator. — [Quote approvals](https://help.getjobber.com/hc/en-us/articles/115012715008)
- Custom Automation Builder (help article: Grow and Plus): triggers = X days (up to 90) after quote sent/approved or invoice due/paid, or morning (8 AM)/evening (7 PM) of that event; up to 6 conditions (quote/invoice status is/is not; client tag; line item includes); actions = notify client by email/text, add client tag, archive quote. Not retroactive. — [Custom automation builder](https://help.getjobber.com/en/articles/custom-automation-builder/); an earlier product update said Plus-only: [Product update](https://productupdates.getjobber.com/76491-save-time-and-tailor-jobber-to-your-needs-with-the-custom-automation-builder)

**Templates**
- Quote templates: all plans; up to 30; admin-only create/edit on Jobber.com, usable in the app. Templated: name, job title, line items, deposit, client message, contract/disclaimer (+ advanced sections on select plans). Not templatable: discount, taxes, custom fields, internal notes/attachments. — [Quote templates](https://help.getjobber.com/en/articles/quote-templates/)
- Template line items stay linked by name to the catalogue: changes to description, cost, price, image, taxable status propagate to every template; renaming the line inside a template breaks the link. — [Quote templates](https://help.getjobber.com/en/articles/quote-templates/)

**Conversion, reports, financing**
- Convert to Job creates a job from approved line items; title, salesperson, discount, tax, deposit and transferable custom fields carry forward. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/); [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- Quotes list: filter by status; sort by client, number, created date, status, total; metrics = conversion rate, sent, converted. Quote report itemises quotes, line items, status, sender, deposit info. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)
- Quote PDFs are not attached to emails by default (checkbox to attach); clients can download from client hub. Wisetack consumer financing can appear on quotes in client hub. — [Quote basics](https://help.getjobber.com/en/articles/quote-basics/)

### Inferences
- Jobber appears to have no quote expiry date; the equivalent behaviour is an automation ("archive quotes N days after sending if still awaiting response"), which the help centre lists as a sample automation.
- The signature-invalidation rule (edit after approval strips the signature but keeps Approved status, and snapshots the old PDF) is a subtle audit-trail behaviour a basic clone would likely miss.
- Wisetack financing is a US lender; treat consumer financing on quotes as likely US-only (not confirmed in the pages read).

### Gaps
- Quote expiry / "valid until": no Jobber help article found; a targeted search returned only other vendors.
- Whether Quote Options has left beta, its plan tier, and its job-conversion behaviour could not be confirmed (article 404'd on direct fetch; details are from the search snippet only).
- Exact plan for quote follow-ups: help centre says "select plans"; the pricing page places automated follow-ups in Connect.
- Line-item "sections/groups" on quotes are mentioned only in a community reply; no help article was read.

## Jobs: one-off vs recurring, visit generation, billing frequency, checklists, job costing, visit completion, requires-invoicing logic, statuses, per-visit line items, attachments, signatures, notes, chemical tracking, custom fields

### Takeaway
A job is a container of visits plus a billing plan. Job type (one-off vs recurring) is immutable. Recurring jobs pre-generate all visits for the schedule at creation and pair a billing method (per visit vs fixed price) with an invoicing schedule that emits "invoice reminders"; an overdue reminder is what puts a job into "Requires Invoicing". Job costing (Grow+) sums line-item cost, timesheet labour and expenses, with different windows for one-off (whole job) and recurring (rolling 30 days).

### Cited Findings

**Job types**
- One-off: one visit or up to 20 visits on non-consecutive dates, no repeat pattern; billed on completion by default. Recurring: repeating visits with one or more invoices. Type cannot be changed after creation; jobs cannot be merged. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Job fields: status, client, title (shown on schedule/app, never to clients), property, job number (digits; defaults to highest+1), type, start/end date, billing frequency, automatic payments flag, schedule, instructions (internal, copied to visits), job custom fields, salesperson. — [Job basics](https://help.getjobber.com/en/articles/job-basics/); [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Created from: Create button, schedule, client profile, approved quote (Convert to Job), request (Convert to job), CSV job import, or online job booking. — [Job basics](https://help.getjobber.com/en/articles/job-basics/); [Jobs list page](https://help.getjobber.com/en/articles/jobs-list-page-and-key-metrics/)

**Recurring schedule and visit generation**
- Repeats: weekly, biweekly, monthly, or custom (weekly/monthly/annual with multiple days, e.g. Mon+Wed or 1st and 3rd Friday), or "As Needed" (creates no visits; add ad hoc). End condition: "Ends after" a duration or "Ends on" a date. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Visits are created automatically up front with the job's line items; a summary panel shows total visit count and first/last dates. Jobber recommends ending recurring jobs "within a few years" because long schedules create many visits and slow editing. Extend via Edit All Visits > change end > "Update Incomplete Visits". — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Times: start/end or "Anytime"; arrival windows appear once start times exist. Unassigned visits allowed. "Schedule later" produces unscheduled visits. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/); [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- "Edit All Visits" changes start date, schedule, times, repetition, instructions, team and checklists for incomplete visits only. Editing a single visit affects only that visit. Visits can be duplicated from the schedule (team conflicts shown in red). — [Job basics](https://help.getjobber.com/en/articles/job-basics/)

**Billing method and invoicing schedule**
- Billing method: Per visit (charged for each visit) or Fixed price (set amount per invoicing period regardless of visit count). — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Invoicing schedule options: Monthly on the last day of the month; After each visit is completed; As needed — no reminders (never enters Requires Invoicing); Once the job is closed; Custom schedule (chosen dates, e.g. 14th and 28th). Summary panel shows number of invoices and first/last invoice dates. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Invoices use the job's tax and discount; later changes affect only future invoices. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/)
- Automatic payments: recurring jobs only, select plans (pricing page: "automatic payment collection" from Connect), needs Jobber Payments and a card on file; invoices are created on the billing schedule and charged automatically. With auto-pay + per-visit invoicing, completing a visit charges the client. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/); [Job basics](https://help.getjobber.com/en/articles/job-basics/); [Automatic payments](https://help.getjobber.com/en/articles/automatic-payments/)
- Multiple invoices can be generated from one job, before or after completion; generating one does not close the job. Batch invoicing exists. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)

**Per-visit (custom) line items**
- A single visit's line items can be edited (quantities changed, items removed/added) without touching the job; the job lists which visits differ. Invoices include custom items only for those visit dates. Exception: on fixed-price jobs, custom visit items do not flow to invoices (but do count in job costing). Max 100 line items per job. — [Create a recurring job](https://help.getjobber.com/en/articles/create-a-recurring-job/); [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)

**Statuses and "requires invoicing"**
- Job statuses: Active; Upcoming (future visits scheduled); Today; Late (active job with a past visit not completed); Unscheduled (visits exist but are not scheduled); Action Required (active job with no upcoming visits — schedule more or close); Requires Invoicing (job has an overdue invoice reminder); Ending Within 30 Days (end date in next 30 days); Archived (closed, no invoicing needed). — [Jobs list page](https://help.getjobber.com/en/articles/jobs-list-page-and-key-metrics/)
- Visit statuses: Today, Upcoming, Completed (plus late/unscheduled by implication). — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Invoice reminders are the mechanism: they appear on the calendar and an overdue one flips the job to Requires Invoicing. Close Job: if invoicing is still needed the job goes to Requires Invoicing and then Archived once invoiced; otherwise it archives immediately. Closing prompts to complete past/same-day incomplete visits and remove future ones. Reopen Job reverses it. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Jobs list: filter by status and type; sort by client, job number, next visit, status, total; metrics "Recent visits" (last 30 days) and "Visits scheduled" (next 30 days) valued as line-item total minus discounts pre-tax, with per-job-type revenue rules. — [Jobs list page](https://help.getjobber.com/en/articles/jobs-list-page-and-key-metrics/)

**Visit completion flow (app)**
- Visit screen: client, title, status, arrival window, call button, address -> Apple Maps/Google Maps/Waze, Start/Stop visit timer (pauses the general clock-in timer), "On my way" text (select plans; hidden if no text-enabled number), Notes tab with photos/video, checklist. — [Jobber app guide](https://help.getjobber.com/hc/en-us/articles/360042930793)
- "Complete visit" stops the timer; if a checklist is blank or required questions are unanswered an alert appears but can be overridden (admins get an activity-feed notice). — [Jobber app guide](https://help.getjobber.com/hc/en-us/articles/360042930793); [Checklists](https://help.getjobber.com/en/articles/checklists/)
- Users with invoice permission then get a prompt: "Close job & invoice now" (draft invoice from job line items), "Close job & invoice later" (job -> Requires Invoicing), or "Leave job open". Then Review & Send, Collect Payment (partial allowed; saved card, new card, reader, or offline methods), and optional client signature on the invoice. — [Jobber app guide](https://help.getjobber.com/hc/en-us/articles/360042930793)

**Checklists (formerly job forms)**
- Plan: Connect, Grow, Plus. Up to 100 checklists. — [Checklists](https://help.getjobber.com/en/articles/checklists/)
- Question types: short answer, long answer, dropdown (single), checkbox, numerical, image upload (10 files, <50 MB each), date picker, signature. Sections + questions; any question can be required; no conditional logic documented. — [Checklists](https://help.getjobber.com/en/articles/checklists/)
- Attach to assessments, jobs (one-off: per visit, new visits copy the previous visit's checklists; recurring: every visit), or a single visit (web only). Auto-attach setting per checklist: all new jobs, all new assessments, or both — no per-service rule. — [Checklists](https://help.getjobber.com/en/articles/checklists/)
- Completed in app (offline-queued) or web; output as PDF (with images) to download or email to the client; Checklists report by date range. — [Checklists](https://help.getjobber.com/en/articles/checklists/)

**Job costing and profitability**
- Plan: Grow and Plus; profit alerts and supplier-invoice scanning Plus only. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Revenue = line items minus job discounts, pre-tax. Total cost = line-item costs + timesheet labour + expenses. Profit margin % = profit / revenue x 100. Completed jobs show margin %; in-progress jobs show costs so far. Never visible to clients. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Labour: per-user cost per hour set in Manage Team; applies only to new timesheet entries (history keeps old rate); computed to the second; running timers cost nothing until stopped. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Expenses: date, item name, description, total, linked job, accounting code, reimburse-to / not reimbursable, receipt; negative amounts allowed for credits. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Recurring jobs show a rolling last-30-days view: fixed price revenue = price x invoice reminders in last 30 days; per-visit revenue = price x visits started in last 30 days. No report for recurring job costs. One-off jobs report has columns for expenses, time tracked, labour cost, line item cost, total cost, profit, profit %. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Known limitation: a material cost entered on both a line item and an expense is double counted. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Permissions: separate "job costing" permission on top of Show pricing, timesheets and expenses view/edit-all. "Email Job Costs CSV" sends line items, expenses, timesheets. Profit bar has a Hide Profitability option. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175); [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Job profit alerts (Plus): one account-wide margin threshold; flags one-off jobs below it on the job page, one-off jobs report, Insights widget, activity feed and a daily admin email digest. — [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175)
- Plus: time categories (driving, office, supplies, break — break recorded as unpaid) and up to 6 custom time labels. — [The Plus plan](https://help.getjobber.com/en/articles/the-plus-plan/)

**Attachments, notes, signatures, chemical tracking, other actions**
- Internal notes/attachments (drag-and-drop) on the job; team-only. Collect Signature opens a signature pad, optionally emails the signed PDF, stores it in internal notes. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Chemical tracking: select plans; "Record Treatment" on the job; web only, not in the mobile app. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Other job actions: Create Similar Job (web only; copies title, type, schedule pattern, billing, line items; never instructions), job follow-up email with survey (select plans), email/text booking confirmation (select plans), Print/Save PDF. — [Job basics](https://help.getjobber.com/en/articles/job-basics/)
- Pricing page lists "unlimited photos and videos per job" and "crew scheduling" as Plus features. — [Pricing](https://getjobber.com/pricing-plans/)

### Inferences
- For snow removal, the Jobber-native pattern is a recurring job with "As Needed" visits (or a custom schedule) and Fixed price billing "Monthly on the last day of the month" — i.e. seasonal contract billed monthly regardless of snowfall — versus Per visit billing "After each visit is completed" for per-push pricing. A parity build needs both the billing-method and invoice-schedule axes, plus invoice reminders as first-class scheduled objects.
- "Requires Invoicing" is derived state (overdue invoice reminder), not a manually set status; likewise Late and Action Required are derived from visit dates. A clone storing a single mutable status column will not reproduce these.
- Because all recurring visits are materialised at creation, Jobber needs explicit end dates and an "Ending within 30 days" filter to prompt renewals; a clone that generates visits lazily would need a different renewal trigger.

### Gaps
- Per-job photo/video limits on plans below Plus were not found.
- How late visits roll over, and any maximum visit count per recurring job, are not documented in the pages read.
- Plans for chemical tracking, job follow-up emails and booking confirmations are only described as "select plans".
- GraphQL job/visit status enum values not retrieved.

## Products & Services catalogue: fields, costs, categories, taxable, online-bookable, price lists

### Takeaway
The catalogue is a single flat "default price list" of items typed Product or Service, with name, description, unit price, tax-exempt flag and active flag on all plans, and unit cost, markup %, photo and online-booking settings on select (Grow-tier) plans. There are no multiple price lists, customer-specific price books, or nested categories.

### Cited Findings
- Fields: item type (Product or Service), name, description, unit price, unit cost (select plans; feeds job costing), markup % (select plans; computes price from cost), photo (shown on quotes in client hub, not PDFs; select plans), "Exempt from tax" checkbox, and an active toggle ("Available on quotes, quote templates, jobs, and invoices"). — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- Online booking settings per item (select plans): bookable toggle, duration (15 min to 12 h), "Allow customers to select quantity" with min/max. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- Editing/deleting an item never alters line items already on existing quotes, jobs or invoices; but changing taxable status affects new invoices generated from existing jobs. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- List UI: single alphabetical list, sort by Name or Type, search name/description. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- CSV import (max 2.5 MB): columns Name, Description, Unit Price, Taxable, Category ("Product"/"Service"), Active; select-plan columns Unit cost, Bookable, Duration Minutes, Quantity enabled, Minimum quantity, Maximum quantity. "Update existing items" overwrites matches. No markup column — markup is derived. Export to CSV (emailed; batches of 1,500). — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- QuickBooks Online (new integration): items import once at connection, then Jobber is the source of truth; legacy integration: QuickBooks is the source of truth. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- The article calls the list a "default price list"; per-client pricing is done with custom line items on the individual document. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)
- Quote templates link to catalogue items by name and inherit later changes. — [Quote templates](https://help.getjobber.com/en/articles/quote-templates/)

### Inferences
- "Category" in Jobber means only Product vs Service; there is no user-defined category tree, SKU, unit of measure, supplier, or stock quantity field in the documented item schema.
- Custom fields do not apply to catalogue items (the custom-fields article lists clients, properties, quotes, jobs, invoices, team only).

### Gaps
- No documentation of multiple price lists / price books or seasonal pricing was found; treated as not available.
- Item count limits are not stated.

## Ordering materials, purchase orders, inventory (native or via integrations)

### Takeaway
Jobber has no native purchase-order, supplier-ordering or inventory module in the documentation read. The closest native feature is Plus-tier supplier-invoice scanning that turns uploaded/forwarded supplier invoices into draft expenses and auto-matches them to a job when the job number was used as the PO number. POs and stock are handled by third-party tools (e.g. Ply, inFlow).

### Cited Findings
- Supplier invoice scanning: Plus plan, or any plan with the Bookkeeping add-on. Upload (web, up to 25 documents at once), upload from a job, forward by email to a unique Jobber address, or capture receipts with Jobber AI in the app. Jobber extracts amount, date, supplier and creates a draft expense that must be approved before it counts toward a job. Non-PDFs are attached as receipts with manual entry. — [Automated job costing / supplier invoices](https://help.getjobber.com/hc/en-us/articles/41272823874967)
- PO matching: Jobber scans the invoice for a job number in PO number, reference/order number, notes/memo lines. "To get a match, put the job number on the purchase order you send your supplier." No match -> draft still created, job chosen at review. Expense total is the invoice subtotal excluding tax. — [Automated job costing / supplier invoices](https://help.getjobber.com/hc/en-us/articles/41272823874967)
- Auto-forwarding rules work only with Google Workspace, not personal Gmail. Only owners/admins can upload supplier invoices. — [Automated job costing / supplier invoices](https://help.getjobber.com/hc/en-us/articles/41272823874967)
- Announced as "Automated job costing is here" in a 2026 product update. — [Product update](https://productupdates.getjobber.com/149890-automated-job-costing-is-here-track-costs-and-protect-margins-automatically)
- Third-party: Ply markets a Jobber integration that syncs jobs, creates purchase orders tied to Jobber jobs, tracks truck stock, and pushes material usage/costs back. — [Ply + Jobber](https://getply.com/jobber/) (vendor marketing)
- Third-party: inFlow's Jobber connection is one-way — reads Jobber jobs and creates sales orders for inventory tracking; does not write back and does not handle purchasing. — [inFlow support](https://www.inflowinventory.com/support/cloud/connecting-inflow-to-jobber/)
- Pricing page states "100+ app integrations" on all plans. — [Pricing](https://getjobber.com/pricing-plans/)

### Inferences
- Jobber's material-cost story is "cost on the line item + expenses + scanned supplier invoices", not procurement. For a snow/yard crew (salt, gravel, mulch) a simple expense-with-receipt per job plus unit cost on catalogue items reaches parity; POs and inventory would be beyond Jobber.

### Gaps
- Jobber's App Marketplace was not browsed directly; other PO/inventory integrations may exist.
- The "Bookkeeping" add-on is referenced by the supplier-invoice article but does not appear on the pricing page or the add-ons article read; its price and contents are unknown.
- Country availability of supplier-invoice scanning was not stated.

## Plan gating (Core / Connect / Grow / Plus) and recently released features (2025–2026)

### Takeaway
Core (single user) covers the full request -> quote -> job -> invoice spine including online booking, templates, lead labels and merge. Connect adds automation of reminders/follow-ups, checklists, custom fields, auto-pay, time and expense tracking. Grow adds upsell quoting (optional items, images, markup), job costing, two-way SMS and the automation builder. Plus bundles Pipeline, Marketing Suite, AI Receptionist, supplier-invoice scanning, profit alerts, files & media library. 2025–2026 additions centre on Pipeline, Receptionist, client merge, automated job costing and quote Options.

### Cited Findings

**Pricing (USD, US pricing page, Nov 2026)**
- Standard monthly (no commitment): Core $49 (1 user); Connect $139 (1 user) / $199 (5) / $299 (10) / $399 (15); Grow $199 (1) / $299 (5) / $399 (10) / $499 (15); Plus $499 (5) / $599 (10) / $699 (15). Annual-prepaid renewal equivalents: Core $29; Connect $99–$299; Grow $149–$399; Plus $399–$529. Extra users $29/mo. 14-day trial with full Grow access. — [Pricing](https://getjobber.com/pricing-plans/)
- Add-ons: Marketing Suite $99/mo, AI Receptionist $99/mo, Pipeline $49/mo. Add-ons cannot be bought during trial; prorated; admin-only. — [Pricing](https://getjobber.com/pricing-plans/); [Add-on features](https://help.getjobber.com/en/articles/add-on-features-to-your-jobber-plan-subscription/)
- Payment fees listed: card 2.9% + 30c; Tap to Pay 2.7% + 30c; bank (ACH, US only) 1%; instant payout +1%. — [Pricing](https://getjobber.com/pricing-plans/)

**Feature -> plan map (from help centre articles and pricing page)**
- All plans (incl. Core): lead labels and lead source; request forms, assessment and job online booking; quotes with deposits, client-hub approval, signatures; quote templates (30); internal quote reminders; one-off and recurring jobs; client merge; client hub; website builder; reporting. — [Lead management](https://help.getjobber.com/en/articles/lead-management/); [Online booking](https://help.getjobber.com/en/articles/online-booking/); [Quote templates](https://help.getjobber.com/en/articles/quote-templates/); [Merge duplicate clients](https://help.getjobber.com/es/articles/merge-duplicate-clients/); [Pricing](https://getjobber.com/pricing-plans/)
- Connect and up: custom fields; checklists; automated client reminders; automated quote and invoice follow-ups; automatic payments; QuickBooks Online sync; time and expense tracking. — [Custom fields](https://help.getjobber.com/en/articles/custom-fields/); [Checklists](https://help.getjobber.com/en/articles/checklists/); [Pricing](https://getjobber.com/pricing-plans/)
- Grow and up: optional line items; line item images; markup/unit cost/margin; job costing; two-way SMS; automatic time tracking; custom automation builder. — [Optional line items](https://help.getjobber.com/es/articles/optional-line-items-on-quotes/); [Job costing](https://help.getjobber.com/hc/en-us/articles/14343244961175); [Custom automation builder](https://help.getjobber.com/en/articles/custom-automation-builder/); [Pricing](https://getjobber.com/pricing-plans/)
- Plus only (or add-on where noted): Sales Pipeline (add-on $49); Marketing Suite — Campaigns, Reviews, Referrals, Job Showcase, Social Posting, Marketing Plan (add-on $99); AI Receptionist (add-on $99); supplier invoice scanning (or Bookkeeping add-on); job profit alerts; files & media library (or Marketing Suite); @mentions; image markup; Jobber AI Voice (beta); time categories/breaks; revenue goals; unlimited photos/videos per job; crew scheduling; custom reports; premium support and dedicated onboarding. — [The Plus plan](https://help.getjobber.com/en/articles/the-plus-plan/); [Pricing](https://getjobber.com/pricing-plans/)

**Country notes**
- AI Receptionist and dedicated phone numbers: US, Canada, UK. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- Online-booking drive time (TravelTime): US, Canada, UK, Australia. — [Online booking](https://help.getjobber.com/en/articles/online-booking/)
- ACH bank payments: US only. E-Transfer appears as a Canada-only offline payment method. — [Pricing](https://getjobber.com/pricing-plans/); [Deposits on quotes](https://help.getjobber.com/en/articles/deposits-on-quotes/)
- Request-form marketing-consent default (email pre-checked) is described specifically for US accounts. — [Request basics](https://help.getjobber.com/en/articles/request-basics/)

**Recent releases (2025–2026)**
- Sales Pipeline rebuilt from a read-only Jobber Labs view into a drag-and-drop board with custom stages, tasks and won/lost reporting; "Introducing Pipeline" product update. — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023); [Product update](https://productupdates.getjobber.com/138449-introducing-pipeline-all-your-sales-opportunities-in-one-place)
- Merge duplicate clients and properties (search result dated Aug 2026). — [Product update](https://productupdates.getjobber.com/154904-merge-duplicate-clients-and-properties)
- Automated job costing / supplier invoice scanning with PO-number matching (search result dated Jul 2026). — [Product update](https://productupdates.getjobber.com/149890-automated-job-costing-is-here-track-costs-and-protect-margins-automatically)
- Receptionist extended to existing clients (caller-ID match, reschedule/cancel). — [Product update](https://productupdates.getjobber.com/121638-receptionist-now-does-more-to-assist-your-existing-clients)
- Quote Options (option sets) in beta. — [Quotes Options Beta](https://help.getjobber.com/hc/en-us/articles/33970469537047-Quotes-Options-Beta)
- Required checklist questions with admin notification on skipped fields. — [Product update](https://productupdates.getjobber.com/101383-make-job-form-fields-mandatory-and-never-miss-a-detail-of-the-job)
- Customisable lead sources and automated UTM lead tracking. — [Product update](https://productupdates.getjobber.com/76481-customize-your-lead-sources-to-more-accurately-track-where-leads-are-coming-from); [Product update](https://productupdates.getjobber.com/80808-get-detailed-information-about-where-leads-are-coming-from-with-automated-tracking)
- Products & Services help article was last updated 23 Nov 2026 and now documents an active/inactive toggle and online-booking import columns. — [Products & Services list](https://help.getjobber.com/hc/en-us/articles/115009735848)

**Source conflicts**
- Custom automation builder: help article says Grow and Plus; an earlier product update said Plus only; pricing page lists "custom workflow automations" under Grow. — [Help](https://help.getjobber.com/en/articles/custom-automation-builder/); contradicted by [Product update](https://productupdates.getjobber.com/76491-save-time-and-tailor-jobber-to-your-needs-with-the-custom-automation-builder)
- Receptionist add-on: help centre and pricing page say $99/mo with 100 conversations and add-on available on Core/Connect/Grow; third-party reviews cite $29/mo for 30 conversations and Grow-only. Jobber's own pages are taken as current. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/); contradicted by [usecarly review](https://www.usecarly.com/blog/jobber-ai-receptionist/)
- Sales Pipeline article's intro says the version lacks custom stages/drag-drop/won-lost reporting while the body documents all three (stale intro text). — [Sales Pipeline](https://help.getjobber.com/hc/en-us/articles/34647017424023)
- Third-party pricing aggregators disagree widely on plan prices; only the official pricing page figures are used above. — [G2](https://www.g2.com/products/jobber/pricing)

### Inferences
- A solo/2–3 person Calgary crew on Jobber would realistically sit on Connect or Grow; the parity target for "what a small crew actually gets" is therefore Core + Connect features (custom fields, checklists, reminders/follow-ups, auto-pay, time/expense) with Grow's optional line items and job costing as the next tier.
- Product-update dates above come from search-result summaries, not from the pages themselves (productupdates.getjobber.com returned 403 on direct fetch), so treat month-level dates as approximate.

### Gaps
- The full per-plan comparison table on the pricing page could not be extracted row by row; several help articles say only "select plans" (chemical tracking, on-my-way texts, arrival windows, job follow-up emails, booking confirmations, advanced quote customisation, online-booking fields in the catalogue).
- Canadian-dollar pricing and any Canada-specific plan differences were not retrieved.
- developer.getjobber.com (GraphQL schema, custom-field API docs) and productupdates.getjobber.com index were inaccessible (403), so exact API field/enum names and a complete 2025–2026 release list are missing.
