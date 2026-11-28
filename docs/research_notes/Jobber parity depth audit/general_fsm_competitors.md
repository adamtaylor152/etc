# General-purpose FSM competitors to Jobber: where they go deeper (late 2026)

Scope: Housecall Pro (HCP), ServiceTitan (ST), Workiz, FieldPulse, ServiceM8, Kickserv, Zuper. Research date 2026-11-27/28.

Source-quality note for the report writer: most detail below comes from vendor help centers, pricing pages and release notes (primary, but marketing-flavoured). Review sentiment comes from aggregator summaries (G2/Capterra counts quoted second-hand) and competitor-authored reviews (Connecteam, ServiceTitan blog, fieldservicesoftware.io); each is flagged where used. No Reddit threads were retrieved directly. Zuper, Method CRM and Markate are essentially uncovered (see Gaps). Vendor prices are USD unless stated.

"Small-crew fit" labels used below: **[SMALL]** = practical for a 1-10 person crew; **[MID]** = useful but usually a paid add-on / higher tier; **[ENT]** = enterprise-oriented, copy the idea only.

---

## CRM & sales: pipelines, lead attribution, proposals, memberships, assets, portals

### Takeaway
The most copyable CRM depth is Housecall Pro's Pipeline: three synced kanban boards (leads, estimates, jobs) with default stage-based follow-up automations that send a message and advance the card, ending in auto-lost/auto-declined. Good/better/best side-by-side proposals with deposit-on-approval, auto-charged membership/service plans, and per-site equipment records are the other recurring "deeper than Jobber" items across HCP, Workiz, ServiceTitan and ServiceM8.

### Cited Findings

**Pipeline / kanban (Housecall Pro) [SMALL idea, sold as add-on]**
- Pipeline is a visual board view over existing leads, estimates and jobs; it does not create records, it manages them in one place, with a toggle between Leads / Estimates / Jobs boards — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Default lead columns: New Lead, First Contact, Second Contact, Third Contact, Won, Lost. Default estimate columns: Unscheduled, Scheduled, In Progress, Completed, Created on Job, Sent, On Hold, Approved, Rejected (Approved/Rejected cards only show if updated in the last 7 days). Default job columns: Unscheduled, Scheduled, In Progress, Completed, Invoice Sent, Invoice Paid (paid cards shown for 7 days) — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Dragging a card opens a dialog that walks the user through the data that status requires (e.g. scheduling); cancelling returns the card to its original column. Cards also have a status dropdown and a quick-view pop-out with call/chat/email and notes — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Default automations (on by default, toggled in settings): a lead sitting N days in First Contact gets a text and moves to Second Contact; later steps send text + email then mark it Lost. A Sent estimate is re-sent and moved through First/Second/Third Follow-Up, then auto-declined. Unscheduled jobs get First-Third scheduling-attempt texts/emails. Completed $0 jobs and paid jobs auto-archive — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Custom automations: choose a starting status (including custom statuses), a delay in minutes/hours/days, optional conditions (tag, job type, lead source), and one of three actions: send message + update status, update status only, or archive. Message content supports variables such as customer first name — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- "Smart Recommendations" for estimates auto-sets the timing of three estimate follow-ups based on factors like industry and seasonality (content editable, timing not). "Quiet Hours" (web, alpha) holds pipeline texts overnight until the next business hour — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Board has search, saved filters (employee, tags, customer, dates, status, value, scheduled date) and a board/table view toggle — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- Admins can rename or add columns/statuses via "Customize boards"; the board is synced with actions taken on the lead/estimate/job itself — [HCP Help: Creating and managing leads with Pipeline](https://help.housecallpro.com/en/articles/9001031-how-to-create-and-manage-leads)
- Pipeline is listed as an optional add-on on the HCP pricing page (no price shown) — [HCP pricing](https://www.housecallpro.com/pricing/)
- As of the fall 2025 release, Leads themselves became available to all HCP plans, creatable from the Job Inbox or a centralized Leads section under Customers — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)

**Lead source attribution and conversion reporting**
- HCP tracks lead source on customers, jobs and estimates; reports include jobs by lead source and estimate conversion by lead source; lead conversion-rate reporting is only available to Pipeline users; summaries group by date, employee or lead source — [HCP Help: Lead source overview](https://help.housecallpro.com/en/articles/5434315-lead-source-overview), [HCP Help: Conversion rate reporting](https://help.housecallpro.com/en/articles/6499730-conversion-rate-reporting)
- Workiz "Ad and source tracking" attributes revenue to specific ad sources and tracking phone numbers; "Genius Leads" extracts lead data from any source and creates a trackable Workiz lead — [Workiz llms.txt feature index](https://www.workiz.com/llms.txt)
- Kickserv "Opportunities" collects inquiries and potential jobs in one dashboard so follow-ups are not missed — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review) (competitor-authored)

**Proposals, good/better/best, estimate behaviour**
- HCP estimates have three layouts: List (all plans), Stacked (multiple options approved together) and Side-by-side good/better/best (Sales Proposal Tool users). The same release added deposits collected at approval and automatic conversion of approved estimates into jobs — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP pricing page lists Sales Proposal Tool as included in MAX with a "$40/mo value" label, otherwise an add-on — [HCP pricing](https://www.housecallpro.com/pricing/); a Software Advice listing (updated June 2026) instead places the proposal tool and recurring service plans under Essentials — [Software Advice: Housecall Pro](https://www.softwareadvice.com/accounting/housecall-profile/) (conflict; vendor page preferred)
- ServiceTitan services have an "Upgrades" field that generates Good/Better/Best options in the field app (options priced between Better and Best are labelled "Even Better"), plus "Recommendations": related services attached as add-ons that the technician is prompted to suggest when adding an item. Recommendations can also be set as category defaults — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md) (page flagged stale by the vendor)
- ServiceTitan "Smart Recommendations" are AI suggestions based on industry sales data, shown after manual recommendations; require account enablement via a CSM **[ENT]** — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- Workiz offers good/better/best sales proposals and field estimates — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8 includes quote options, online quote acceptance, e-signatures, remote signatures and quote follow-ups on the Free plan; "Proposals" is a Growing-plan ($79/mo) feature — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- ServiceM8 clients can accept quotes without creating an account; a client "ask a question" emails the manager and pins to the job activity bar — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8) (competitor-authored)
- Kickserv users praise seeing whether customers have opened invoices and estimates — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)

**Memberships / service plans**
- HCP Service Plans: billed monthly, quarterly, six-monthly or annually; the card saved on the plan is automatically charged at that frequency; customers get an automatic email on failed payment; plans due appear in a "Due for Billing" section of the Service Plans dashboard; updating a card charges any outstanding balance immediately without moving the billing date — [HCP Help: Billing and payments for service plans](https://help.housecallpro.com/en/articles/4530621-billing-and-payments-for-service-plans), [HCP Help: Service plans FAQs](https://help.housecallpro.com/en/articles/5485025-service-plans-faqs)
- HCP recurring service plans are in the MAX tier per the vendor pricing page — [HCP pricing](https://www.housecallpro.com/pricing/)
- Workiz Service Plans: recurring maintenance agreements with automatically scheduled visits and billing — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- FieldPulse lists Maintenance Agreements as part of the core platform — [FieldPulse pricing](https://www.fieldpulse.com/pricing)
- ServiceTitan services carry four static price slots: standard, member, add-on, and member add-on (a $0 member/add-on price falls back to standard) — i.e. membership pricing is built into every price-book item — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- A comparison site states HCP's membership/recurring-revenue billing is stronger out of the box than Jobber's and that shops running maintenance plans report better results on HCP — [fieldservicesoftware.io: HCP vs Jobber (reviewed March 2026)](https://fieldservicesoftware.io/comparisons/housecall-pro-vs-jobber/) (no review counts or sources given)

**Customer segments, tags, discounts, flags**
- HCP Price Book has a Discounts tab for percentage or dollar discounts tied to groups (e.g. first-time customers, military) — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP shows a red "Do Not Service" label in Chat and Voice for flagged customers to prevent accidental scheduling; customer tags surface on job/estimate pages; notes from leads, estimates, jobs and profiles are centralized; customer profile has an activity feed with appointments at top — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- Workiz custom fields on jobs and clients feed reporting and search — [Workiz llms.txt](https://www.workiz.com/llms.txt)

**Equipment / asset records at the customer site**
- Workiz Equipment Tracking records serial numbers, photos, warranty details and service history for equipment at client sites — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8 Asset Management (Growing plan) catalogues equipment and records each asset's service history; a 2018 release described QR codes per asset — [ServiceM8 pricing](https://www.servicem8.com/pricing), [ServiceM8 help: jobs and scheduling index](https://support.servicem8.com/help-center/topics/jobs-and-scheduling.md), [ServiceM8 7.0 release](https://www.servicem8.com/september-2018-update) (QR detail is old)
- FieldPulse lists Asset Management in the core platform — [FieldPulse pricing](https://www.fieldpulse.com/pricing)

**Customer portals**
- HCP Websites gained a Customer Portal integration where customers can book, pay and manage services from the contractor's site; job photos/videos/PDFs shared with customers are viewable in the portal with notification — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- Workiz client portal: review/sign estimates, pay invoices, view jobs — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- Kickserv portal: request service, review quotes, check visit details, track invoices and payments — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)

### Inferences
- For a small snow/yard crew, the highest-leverage copy is "stage = automation": every pipeline column owns a timed follow-up that advances or closes the card. This removes the manual chasing that Jobber's quote follow-ups only partly cover, and HCP's defaults (3 touches then auto-lost) are a sensible out-of-box template.
- HCP's three-board model (lead / estimate / job, each with its own stages, all synced to the underlying record) is simpler to build than a generic deal object and maps onto an existing request-quote-job data model.
- ServiceTitan's four-price-slot item (standard/member/add-on/member add-on) is a cheap data-model change that unlocks membership discounts and add-on pricing without a separate rules engine; relevant to seasonal snow contracts with member rates for extras (e.g. salting, roof clearing).
- "Do Not Service" flags and group discounts are trivial to implement and absent from many small CRMs.
- Asset/equipment records matter less for snow/yard care than for HVAC; the analogous object is a property profile (lot size, driveway dimensions, gate codes, obstacles), which none of the sources describe in depth.

### Gaps
- Lead scoring: no source found describing lead scoring in any of these products.
- Customer lifetime value as a displayed metric: not confirmed for any product.
- Property profiles (multi-property customers, per-property attributes): not covered in sources retrieved.
- Estimate templates: ServiceTitan mentions job/estimate templates for CSRs but gives little detail; ServiceM8 lists "job templates" without detail.
- Pipeline add-on price not published on the HCP page.
- Zuper, Method CRM, Markate CRM depth: no primary sources retrieved (Zuper pricing URL returned 404).

---

## Ordering & inventory: price books, materials, inventory, purchase orders, supplier integrations, online upsell

### Takeaway
All the Jobber competitors treat a structured price book as the hub: items carry cost, duration, media and linked materials, and feed estimates, inventory deduction and POs. ServiceTitan's Dynamic Pricing (price = billable hours x rate + marked-up linked material cost, recalculated when supplier cost changes) is the deepest model; Workiz and FieldPulse offer the small-shop version (truck/warehouse stock, low-stock alerts, POs tied to price book and jobs). Customer-facing online upsell/add-on ordering is poorly documented across the set.

### Cited Findings

**Price books**
- HCP: price book on Basic; flat-rate pricing on Essentials — [HCP pricing](https://www.housecallpro.com/pricing/). Price book items can now carry a time duration per field/task that feeds scheduling — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP service line item report shows revenue, margins and details for every service within a job, not just the first line item, to inform pricing and upsell decisions — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- ServiceTitan Pricebook: catalog of services, materials and equipment; each item must be in a category/subcategory to appear in the field app; categories control which business units' technicians see items and can carry default media and default recommendations — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- ServiceTitan service fields: code, name, description, warranty text, tax/discount eligibility flags, billable hours, images, MP4 video, PDFs, YouTube links, conversion tags and cross-sale groups for reporting — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- ServiceTitan Dynamic Pricing **[ENT in full; idea is SMALL]**: a rule per category combines a billable rate (static hourly or progressive tiers, e.g. higher for the first two hours), markups (gross margin, percentage, fixed dollar or multiplier, varying by cost range), optional surcharge, and business-unit overrides; materials/equipment linked to a service supply the cost that is marked up; edits to a rule immediately update new estimates — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- ServiceTitan "Smart Start" builds a starter catalog, billable rate, markups, optional surcharge and a dynamic pricing rule for new Pricebook Pro users — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- Workiz Price Book: flat-rate and item catalogs that can be shared with customers or integrated with industry-standard books; Price Book Pro adds preloaded, auto-updating trade catalogs — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- FieldPulse Pricebook (paid add-on): fixed prices for services plus material and labor costs, custom categories with search, bulk price adjustment across services/materials/labor, a flat-rate job form with markup category and flat-rate commission fields — [FieldPulse: Pricebook](https://www.fieldpulse.com/features/pricebook), [FieldPulse pricing](https://www.fieldpulse.com/pricing)
- ServiceM8: "Bundles" (Growing plan), markup billing and job profitability (Premium, $149/mo), job templates (Free) — [ServiceM8 pricing](https://www.servicem8.com/pricing)

**Supplier catalog / cost integrations**
- ServiceTitan Pricebook Connect updates costs for supplier-integrated materials (document names SRS Distribution, ABC Supply, QXO) and Dynamic Pricing recalculates service prices **[ENT]** — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)
- ServiceTitan Full Procurement Integration connects contractors with suppliers for real-time pricing, contractor-specific vendor costs, electronic purchase orders, and checking supplier stock levels before submitting a PO **[ENT]** — [ServiceTitan Help: Full procurement integration](https://help.servicetitan.com/commercial/docs/full-procurement-integration-home), [ServiceTitan Help: Procurement partner FAQ](https://help.servicetitan.com/docs/full-procurement-integration-partner-faq)
- ServiceM8 lists "automated supplier import" (Free), "supplier invoice import" (Starter, $29/mo), barcode scanning and document scanning (Free) — [ServiceM8 pricing](https://www.servicem8.com/pricing)

**Inventory by location**
- Workiz: real-time stock across warehouses, offices and service vehicles; low-stock alerts; parts assignable to jobs so techs arrive prepared; inventory spending and usage-trend reports — [Workiz: Inventory management](https://www.workiz.com/features/inventory-management/)
- FieldPulse: real-time stock levels and material locations across multiple job sites and warehouses, low-stock alerts, on-site barcode scanning, inventory items quoted and billed from the same list tied to the Pricebook, automated reordering that generates and sends POs to preferred suppliers, and POs buildable from the job site — [FieldPulse: Inventory management](https://fieldpulse.com/features/inventory-management) (vendor page, undated)
- ServiceTitan (per its own competitor article): stock tracked across warehouses and trucks in real time, reorder alerts, PO management — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)

**Purchase orders**
- ServiceTitan POs: created under Inventory or Purchasing with a vendor, business unit and ship-to location; ship-to can be the warehouse, a vendor counter pick-up, the job address, or a technician's home; inventory quantity does not increase until the receipt is posted — [ServiceTitan Help: Manage parts purchase orders](https://help.servicetitan.com/docs/manage-parts-purchase-orders.md)
- ServiceTitan Purchasing Approval Workflow sets rules for who can approve POs based on cost (2025, GA) **[ENT]** — [ServiceTitan release notes ST-75](https://help.servicetitan.com/release-notes/release-notes-st-75)
- Workiz POs are linked to the price book and to jobs — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8's default "Parts on Order" queue parks a job with an expiry date until the part arrives (see scheduling section) — [ServiceM8 Help: Queues overview](https://support.servicem8.com/help-center/servicem8-add-ons/servicem8-add-ons/queues-overview.md)

**Job-material costing**
- HCP job costing is on the Basic plan; labor rates manageable from the field tech status section with per-job profitability — [HCP pricing](https://www.housecallpro.com/pricing/), [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- Workiz expense management links receipts to jobs and syncs to QuickBooks — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- FieldPulse job costing is in the core platform and integrates with QuickBooks — [FieldPulse pricing](https://www.fieldpulse.com/pricing)

**Customers ordering / upselling online**
- HCP online booking service areas: map view, ZIP-based named areas, drive-time settings, technician assignment per area, and extra trip charges per area — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- Workiz Service Areas define zones by city/ZIP/region that govern scheduling, online booking and Reserve with Google; online booking is a 24/7 self-service portal linked to website, social and Google — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8 online booking (all plans) assigns new bookings to the earliest available qualified employee — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8)

**Conflicts / cautions**
- ServiceM8 inventory: Tekpon says it tracks inventory levels; a competitor (QuoteIQ) says it has no inventory tracking; the vendor pricing page lists no dedicated inventory feature (only barcode scanning, supplier imports, markup billing, bundles) — [Tekpon](https://tekpon.com/software/servicem8/reviews/); contradicted by [QuoteIQ comparison](https://myquoteiq.com/compare/servicem8/) and [ServiceM8 pricing](https://www.servicem8.com/pricing)
- Kickserv reviewers report it lacks tools to track parts and materials — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)

### Inferences
- The copyable small-crew core is: price-book item = {price, cost, default duration, linked materials with quantities, photo, recommended add-ons}. That single structure drives quote speed, schedule duration, job-cost margin, stock deduction and reorder. For snow/yard care, "linked materials" would be salt/ice-melt, mulch, seed, fertilizer per service.
- ServiceTitan's PO ship-to options (warehouse / supplier counter pick-up / job site / tech's home) and "stock only increases on receipt" are good design rules even for a minimal PO feature.
- Per-area trip charges and per-area technician assignment in online booking (HCP) are directly useful for a Calgary crew with quadrant-based routes.
- Supplier real-time catalog integrations are enterprise plumbing; the small-scale substitute is ServiceM8-style supplier price-list/invoice import (CSV or scanned invoice to cost updates).
- Online add-on ordering by customers (e.g. "add salting to today's visit" from a portal) appears to be a genuine gap in this competitor set based on what was found, so it would be differentiation rather than parity.

### Gaps
- No source found describing a customer-facing self-serve upsell/add-on flow (cart-style add-ons in booking or portal) for any product.
- HCP inventory/materials tracking: not mentioned on HCP's pricing page or fall 2025 notes; HCP Profit Rhino and "visual price book" were named only in a search summary, not confirmed on a primary page.
- FieldPulse supplier catalog integrations and good/better/best: not described on its Pricebook page.
- Workiz: stock transfers between locations, automatic deduction on invoice, and reorder mechanics are not described on its inventory page; which plan includes inventory is unstated.
- ServiceM8 "Bundles" and "automated supplier import" mechanics were not retrieved in detail.
- Zuper inventory/parts/PO: only third-party listings mentioning "parts management" and "inventory management" ([GetApp](https://www.getapp.com/all-software/a/zuper/), [SourceForge](https://sourceforge.net/software/product/Zuper/)); no mechanics.

---

## Scheduling & dispatch

### Takeaway
Differentiators over Jobber are slot-suggestion by drive time (HCP "Find a time"), AI auto-assignment by availability/proximity/skills/service area (Workiz Genius Scheduling), "waiting-on" job queues with expiry dates (ServiceM8), and richer on-my-way messages with tech photo/bio and live ETA (Workiz, ServiceM8). Most are available to small crews; ServiceTitan's Dispatch Pro is the enterprise version.

### Cited Findings
- HCP "Find a time" suggests slots based on preferred date, time and technician, ranked by drive time; a left rail shows line items, notes and tags while scheduling; unassigned and "anytime" jobs can be scheduled without a tech or fixed time; tapping an empty mobile calendar slot adds a job, estimate or event — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP tiering: Routes, checklist automations, photo reports/annotations and employee GPS (phone-based, no hardware) at Essentials; route optimization at MAX; vehicle GPS/dashcams as add-on; "offline viewing" on every plan — [HCP pricing](https://www.housecallpro.com/pricing/)
- Workiz Genius Scheduling picks the time and tech for each job from availability, proximity and skill set, accounting for job duration, travel time and each tech's service area, and places new jobs into gaps between existing appointments — [Workiz: Genius Scheduling](https://www.workiz.com/features/genius-scheduling/) (page does not say whether suggestions need approval, or which plan)
- Workiz "On My Way" sends customers live ETA updates with the technician's photo and bio; dispatching includes GPS tracking, route optimization and automatic customer notifications; also multi-day jobs, subcontractor assignment, and step-by-step checklists per job type — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8 Queues: virtual folders that park jobs on hold. Regular queues hold jobs waiting on an external action (defaults: Parts on Order, Pending Quotes, Workshop); assignable queues hold jobs waiting on an internal action and are assigned to a staff member, appearing in their "For My Review" list with a notification. Every queued job has an expiry date (queue default or per-job); on expiry it is flagged on the Dispatch Board and appears in Action Required and Unscheduled lists — [ServiceM8 Help: Queues overview](https://support.servicem8.com/help-center/servicem8-add-ons/servicem8-add-ons/queues-overview.md)
- ServiceM8 Free-plan dispatch features: on-the-way SMS, arrival tracking, booking confirmations/reminders, staff GPS, urgent dispatch, schedule-change alerts, automatic time tracking, trip time tracking, dispatch map, navigation, Apple CarPlay, Siri shortcuts; recurring jobs on all plans; auto-pay for recurring jobs from Starter — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- ServiceM8 offline mode: in an Android test, users could add jobs, send SMS, add notes, start/complete jobs and clock on without internet — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8) (competitor-authored but hands-on)
- ServiceM8 forms & certificates and asset management require Growing; checklists, photos/videos, PDF fill-in and video transcription are Free — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- HCP mobile: photo uploads auto-retry when signal improves; three photo-quality settings trade image quality against upload speed — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- ServiceTitan: Dispatch Pro gives AI-based technician recommendations and capacity planning based on availability and travel time; a Dispatch Activity Center was released to all users **[ENT]** — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review), [ServiceTitan release hub summer 2025](https://help.servicetitan.com/release-hub/docs/summer-2025-release-hub-st-74)
- Kickserv: drag-and-drop scheduling, GPS navigation, route-based scheduling, automated reminders; reviewers complain the calendar becomes hard to read when full and that there is no centralized view of pending jobs for route optimization — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)
- ServiceM8 criticisms: cluttered dispatch board split across tabs, no auto-scheduler or availability tracking, online bookings do not notify the assigned employee, Android lacks GPS time tracking — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8)
- Zuper is listed by aggregators with skills tracking, route optimization and dispatch management — [GetApp: Zuper](https://www.getapp.com/all-software/a/zuper/), [Capterra: Zuper](https://www.capterra.com/p/197014/Zuper/)

### Inferences
- ServiceM8-style queues with expiry dates are a cheap, high-value pattern for a small crew: "waiting on customer", "waiting on materials", "waiting on weather/thaw" buckets that automatically resurface. This fits snow/yard work where jobs are frequently weather-blocked.
- "Find a time" (rank candidate slots by added drive time) is a much smaller build than full route optimization and delivers most of the benefit for one-off jobs inserted into recurring routes.
- Price-book default durations (HCP) are the prerequisite for any slot suggestion or capacity view.
- Offline tolerance at the level of "queue writes and photo uploads, retry on reconnect" (HCP/ServiceM8) is the practical bar, relevant to winter field work with gloves, cold batteries and patchy signal.
- Skills-based assignment is mostly irrelevant below about 5 staff; service-area/zone assignment is the small-crew equivalent.

### Gaps
- Capacity planning views for small crews (e.g. hours booked vs available per day) were not documented outside ServiceTitan claims.
- Uber-style live map tracking link specifics (what the customer sees) were not retrieved for ServiceM8 or HCP; only Workiz's photo/bio/ETA description.
- Custom job status / sub-status workflows: not described in the Workiz index; FieldPulse "ClearPath" and "Custom Workflows" are named but not explained.
- Zuper intelligent dispatch mechanics: no primary source.

---

## Communications & AI

### Takeaway
By 2026 every vendor in this set sells an AI receptionist/CSR plus a built-in phone system as add-ons, and bundles lighter AI (writing helper, natural-language reporting, job summaries) into base plans. Workiz is the most phone-centric; ServiceM8 has the cheapest phone add-on.

### Cited Findings
- HCP: "AI team members" included in every plan; CSR AI (answers every call and chat, day or night) and Voice (call flows, synced customer info) are add-ons — [HCP pricing](https://www.housecallpro.com/pricing/)
- HCP CSR AI "Tell me more" summarizes a customer's upcoming jobs, outstanding balance, service history and suggested next steps; Analyst AI answers reporting questions in plain language and saves the result as a dashboard report, with filtered customer lists, job-level queries and invoice summaries; Marketing AI "Write it for me" drafts invoice messages and customer-friendly estimate/line-item descriptions; Global Chat is available on every page — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- Workiz Genius Answering is an AI receptionist that answers missed calls and turns them into scheduled jobs — [Workiz llms.txt](https://www.workiz.com/llms.txt); vendor page describes it handling calls, emails and texts and dispatching "without any human intervention" — [Workiz: Genius Scheduling](https://www.workiz.com/features/genius-scheduling/); a competitor blog disputes that it actually picks up calls — [Ainora review](https://ainora.lt/blog/workiz-ai-review-alternatives-2026) (commercially interested; conflict noted)
- Workiz Communications Suite (separate add-on): built-in VoIP, two-way texting, call queues, call flows, call recording, call tags, call masking, free 10DLC registration; Genius Marketing runs AI campaigns triggered by Workiz data with job-level attribution per message — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- Workiz automations (reminders, follow-ups, on-my-way, review requests, overdue-invoice nudges) are capped per plan at 2, 5, 10 or 30 — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- FieldPulse: "Maverick" AI office assistant included on all plans; "Operator AI" (captures leads and books jobs) and "Engage" phone system (shared and business lines, call/text logging, private personal numbers; priced per line and license) are add-ons — [FieldPulse pricing](https://www.fieldpulse.com/pricing)
- ServiceM8: AI Writing Helper free; AI Smart Helper drafts messages, quotes and invoices and summarises jobs (10 assists/day on Free, unlimited on paid); Office Agent Pro $39/mo on Starter+; ServiceM8 Phone from $19/mo with caller ID, call recording and transcription, call groups, after-hours routing, unlimited users; video transcription, two-way SMS, shared inbox (Growing) — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- ServiceM8's one-click AI auto-invoice drafts line items and a work description — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8)
- Review automation: HCP "review management" is on Basic; coming-soon items include social sharing of reviews, in-person reviews and a reviews dashboard — [HCP pricing](https://www.housecallpro.com/pricing/), [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates); ServiceM8 "customer feedback requests" on Free — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- Kickserv has no built-in AI; AI is via a separate Kickcall integration — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)
- ServiceTitan's AI assistant is "Atlas", powered by Titan Intelligence; Contact Center Pro uses the price book for CSR intake workflows **[ENT]** — [ServiceTitan blog: Pantheon 2025](https://www.servicetitan.com/blog/pantheon-2025-live-coverage), [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md)

### Inferences
- Table stakes for 2026: an AI writing helper for quote/invoice/line-item descriptions and a natural-language "ask your data" box. Both are cheap to add on top of an LLM API and are bundled free by HCP, FieldPulse and ServiceM8.
- AI call answering that books directly into the schedule depends on having service areas, price-book durations and slot suggestion in place first; it is a second-phase feature.
- A customer-context summary card ("upcoming jobs, balance, history, next step") shown when a call/text arrives is high-value for a one-person office and is independent of running a phone system.
- Workiz's plan-capped automation count is a monetization pattern, not a feature to copy; HCP's stage-bound automations are the better model.

### Gaps
- Add-on prices for HCP CSR AI/Voice, FieldPulse Operator AI/Engage, and Workiz Genius Answering/phone were not published on the pages retrieved.
- Website chat widgets: not specifically documented in retrieved sources (HCP "Global Chat" is internal/inbox).
- Voice-to-notes: only ServiceM8 "video transcription" and call transcription were confirmed.
- Canadian availability of the phone/SMS add-ons (10DLC is US-specific) was not checked.

---

## Money: financing, card on file, memberships billing, job costing, commissions, accounting sync

### Takeaway
HCP bundles the most money features low in its tiers (consumer financing and job costing on Basic; commissions and QBO sync on Essentials) and auto-charges membership cards. Workiz packages payments, expense card, expense management and Wisetack financing as "Workiz Pay". ServiceM8 gates job profitability/markup billing to its $149 tier but gives auto-pay for recurring jobs at $29.

### Cited Findings
- HCP Basic includes payments and consumer financing, job costing and review management; Essentials adds commissions and QuickBooks Online sync; card processing "as low as 2.59%"; Tap to Pay, Payroll and Accounting (bookkeeping service) are add-ons — [HCP pricing](https://www.housecallpro.com/pricing/)
- HCP added ACH invoice payment (routing + account number, enabled via an "Accept ACH" invoice setting) and deposits collected at estimate approval — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP card on file: contractors can request and save a card for future payments; customers can update it via the portal; service-plan cards are auto-charged each billing period — [HCP Help: How does my customer update their card on file](https://help.housecallpro.com/en/articles/4201481-how-does-my-customer-update-their-card-on-file), [HCP Help: Service plans FAQs](https://help.housecallpro.com/en/articles/5485025-service-plans-faqs)
- HCP coming-soon: commissions with flexible calculations and role-based splits — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- A competitor review prices HCP's Sales Proposal tool at $40/mo and Payroll at $40/mo plus $6 per employee — [Connecteam: Housecall Pro review](https://connecteam.com/reviews/housecall-pro/)
- Workiz Pay covers payments, an expense card, expense management and financing; consumer financing is via Wisetack; commission management auto-calculates technician commissions; invoices sync to QuickBooks with automated reminders — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceM8: mobile/online card payments, live statements and automated payment reminders on Free; auto-pay for recurring jobs and progress invoicing from Starter; job profitability, job costing and markup billing on Premium; QuickBooks Online and Xero on Free — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- FieldPulse: payments and job costing in core; FieldPulse Financing a premium product — [FieldPulse pricing](https://www.fieldpulse.com/pricing)
- A comparison site reports Jobber's QBO sync as the cleanest in the SMB tier and a recurring HCP complaint of duplicate QuickBooks entries when sync is misconfigured; HCP reaches Xero only via Zapier while Jobber has a direct Xero integration — [fieldservicesoftware.io: HCP vs Jobber](https://fieldservicesoftware.io/comparisons/housecall-pro-vs-jobber/) (unsourced "user reports")
- ServiceTitan syncs accounting with QuickBooks Online or Sage Intacct and captures vendor invoices automatically **[ENT]** — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)

### Inferences
- For a Calgary snow/yard crew on seasonal contracts, the HCP service-plan billing model (monthly/quarterly/semi-annual/annual auto-charge, failed-payment email, "Due for Billing" queue, immediate catch-up charge on card update) is the single most relevant money feature to copy.
- Deposit-on-approval plus auto-convert-to-job closes the quote-to-cash loop with no office work and is a small build.
- Consumer financing integrations (Wisetack and similar) named in sources are US lenders; Canadian applicability is unverified and the feature matters mainly for large-ticket trades, not snow/yard care.
- Per-job profitability needs only labor rate x tracked time + linked material cost + expenses; HCP offers it on its cheapest plan, so it should be considered baseline rather than premium.

### Gaps
- Financing provider details and Canadian availability for HCP/FieldPulse: not found.
- Commission rule structures (percent of revenue vs margin, per-item spiffs) not detailed in any retrieved source.
- Payment processing rates in CAD and Canadian ACH/EFT/Interac equivalents were not researched.

---

## Reporting, dashboards and automation builders worth copying

### Takeaway
The most copyable ideas are HCP's natural-language report builder that saves answers as dashboard tiles, line-item-level margin reporting, lead/estimate conversion by source, and the status + delay + condition + action automation model.

### Cited Findings
- HCP Analyst AI: ask reporting questions in plain language, get instant insights, save reports to the dashboard — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP service line item report: revenue and margins for every service within a job — [HCP fall 2025 product updates](https://housecallpro.com/resources/fall-2025-product-updates)
- HCP conversion reports grouped by date, employee or lead source; lead conversion-rate report gated to Pipeline users — [HCP Help: Conversion rate reporting](https://help.housecallpro.com/en/articles/6499730-conversion-rate-reporting)
- HCP automation model: starting status, delay (minutes/hours/days), conditions (tag, job type, lead source), action (message + status change / status change / archive); can be edited, disabled or duplicated — [HCP Help: Getting started with Pipeline](https://help.housecallpro.com/en/articles/6185127-getting-started-with-pipeline)
- HCP checklist automations at Essentials tier — [HCP pricing](https://www.housecallpro.com/pricing/)
- Workiz reporting covers dispatcher efficiency, service-line revenue, ROI and expenses — [Workiz llms.txt](https://www.workiz.com/llms.txt)
- ServiceTitan conversion tags and cross-sale groups on price-book items support sales reporting; scheduled reports — [ServiceTitan Help: Pricebook Pro setup guide](https://help.servicetitan.com/docs/pricebook-pro-setup-guide-in-servicetitan-max.md), [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review)
- ServiceM8 connects to Zapier and n8n on the Free plan; has a 90-day account activity log; reports cannot be scheduled or emailed and CSV export needs an Advanced Reporting Pack — [ServiceM8 pricing](https://www.servicem8.com/pricing), [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8)
- A comparison site rates Jobber's reporting (revenue by service type, technician performance, job profitability, custom dashboards) as stronger than HCP's "basic dashboards" — [fieldservicesoftware.io: HCP vs Jobber](https://fieldservicesoftware.io/comparisons/housecall-pro-vs-jobber/)

### Inferences
- A four-part automation primitive (trigger status, delay, conditions, action) covers lead follow-up, quote chasing, scheduling nudges, review requests and auto-archive with one engine; quiet hours should be built in from the start.
- Reporting is an area where Jobber is already considered ahead of HCP, so parity with Jobber here is likely sufficient; the incremental win is natural-language querying and line-item margin.

### Gaps
- FieldPulse dashboards/reporting and "ClearPath" workflow enforcement: named only.
- Zuper workflow builder: no source.

---

## What small (1-10 person) operators praise or miss

### Takeaway
Evidence retrieved is aggregator-level and competitor-authored rather than first-hand Reddit/G2 text. The consistent signals: ease of use and fast setup are the most-praised attributes; add-on creep and per-user pricing are the most common complaints (especially HCP); memberships, consumer-facing communications and unlimited-user pricing (ServiceM8) are valued by small shops; lack of inventory and CRM/pipeline is a named complaint for the simplest tools (Kickserv).

### Cited Findings
- HCP on G2: 4.3/5 across 204 reviews; top pros Ease of Use (16 mentions) and Easy Setup (10); top cons Missing Features (7) and Expensive (4) — [G2: Housecall Pro vs Workiz](https://www.g2.com/compare/housecall-pro-vs-workiz) (as summarized by search tool; snapshot date unclear)
- HCP gets pricier once add-ons are needed, and charges more per extra user than competitors, per a competitor-authored review — [Connecteam: Housecall Pro review](https://connecteam.com/reviews/housecall-pro/); add-on cost also listed as a con by [Geekflare](https://geekflare.com/software/housecall-pro-review/)
- HCP Capterra summary flags a cumbersome, inflexible invoicing process as a common complaint (2,736 reviews) — [Capterra: Housecall Pro](https://www.capterra.com/p/140363/housecall-pro/)
- FieldPulse on G2: 4.7/5 across 370 reviews; top pros Customer Support (51) and Ease of Use (47); cons Improvement Needed (14) and Limited Customization (13) — [G2: HCP vs ServiceM8 vs FieldPulse](https://www.g2.com/compare/housecall-pro-vs-servicem8-vs-fieldpulse-fieldpulse)
- Workiz: G2 4.5/5 (223 reviews), Capterra 4.4 (218) — [G2: Housecall Pro vs Workiz](https://www.g2.com/compare/housecall-pro-vs-workiz), [Capterra: HCP vs Workiz](https://www.capterra.com/compare/140363-147525/HouseCall-Pro-vs-Workiz)
- Workiz pricing conflict: vendor index says Standard $275/mo and Pro $325/mo billed annually for 5 users, phone and Workiz Pay sold separately — [Workiz llms.txt](https://www.workiz.com/llms.txt); Capterra lists a $187 starting price — [Capterra: HCP vs Workiz](https://www.capterra.com/compare/140363-147525/HouseCall-Pro-vs-Workiz)
- ServiceM8 ratings: Capterra 4.5, GetApp 4.5, App Store 4.6, Google Play 3.7 (Aug 2026). Praised: online booking, account-free quote approval, flat pricing with unlimited users, recurring jobs, responsive support. Criticized: cluttered dispatch board, no auto-scheduler, no discount feature, quotes require creating a job first, slow web app, weaker Android — [Connecteam: ServiceM8 review](https://connecteam.com/reviews/servicem8)
- ServiceM8 pricing is by jobs per month with unlimited users from $29/mo (50 jobs) to $349/mo (1,500+) — [ServiceM8 pricing](https://www.servicem8.com/pricing)
- Kickserv (Start $60/mo up to 5 users; Run $119; Scale $199): praised for visual calendar, low learning curve and open-tracking on invoices/estimates; criticized for mobile glitches, slow search, cluttered calendar when busy, no built-in CRM, no inventory tracking — [ServiceTitan blog: Kickserv review](https://www.servicetitan.com/blog/kickserv-review) (competitor-authored, quoting G2)
- HCP tier prices: Basic $59/mo annual ($79 monthly) 1 user; Essentials $149 ($189) 5 users; MAX $299 ($329) 8 users, $35/mo per additional user — [HCP pricing](https://www.housecallpro.com/pricing/)
- Positioning per one comparison site: HCP best for 1-8 techs and owner-run dispatch; Jobber best for 5-15 techs; both hit a ceiling around 15-25 techs; HCP praised for mobile app, visual calendar, membership billing and consumer tools; HCP complaints include support variability, QBO duplicates and thin reporting with several crews; Jobber praised for fast support, reliable GPS, stable offline mode — [fieldservicesoftware.io: HCP vs Jobber](https://fieldservicesoftware.io/comparisons/housecall-pro-vs-jobber/) (no review counts or sourcing)
- G2 summary: users find HCP's marketing services valuable but feel Jobber is a more integrated solution for day-to-day management — [G2: Housecall Pro vs Jobber](https://www.g2.com/compare/housecall-pro-vs-jobber)
- Vendor-blog positioning (unverified): ServiceM8 suits crews that add people often (unlimited users, priced by jobs; iPhone-first); Workiz suits businesses where most jobs arrive by phone — [Fieldproxy: Jobber alternatives 2026](https://www.fieldproxy.ai/resources/blog/jobber-alternatives-ai-field-service-2026) (vendor blog)

### Inferences
- High value at small scale, in rough priority order for a snow/yard crew, synthesized from the above: (1) stage-driven follow-up automations on leads and quotes; (2) auto-billed seasonal/membership plans with card on file; (3) deposit on approval and auto-convert to job; (4) price book with cost, duration and linked materials driving per-job margin; (5) waiting-on queues with expiry; (6) drive-time-ranked slot suggestions and zone-based online booking with trip charges; (7) on-my-way texts with crew photo and live ETA; (8) AI writing helper and plain-language reporting; (9) simple truck/shed stock with low-stock alerts and a minimal PO.
- Enterprise-only or low-value at this scale: supplier real-time procurement integrations, PO approval workflows, dynamic pricing rule engines with business-unit overrides, AI smart recommendations trained on industry data, contact-center tooling, skills-based dispatch, multi-warehouse transfers.
- The dominant small-operator complaint about competitors is paying extra for each capability; bundling pipeline, proposals and plans without add-on fees is itself a competitive position.
- Simplicity is the most praised attribute across all products, so depth should be added as progressive disclosure (defaults on, settings optional) in the way HCP ships default pipeline automations.

### Gaps
- No Reddit threads (r/sweatystartup, r/lawncare, r/smallbusiness, r/HVAC) were retrieved; searches returned only vendor blogs paraphrasing Reddit. Small-operator sentiment here is therefore second-hand and should be treated as weak evidence.
- Individual G2/Capterra review text was not fetched; counts above are aggregator summaries with unclear snapshot dates.
- No snow-removal or Canadian-market-specific review evidence was found.
- Zuper: pricing URL returned 404; only aggregator feature listings (skills tracking, parts management, self-service portal, route optimization) were found, with no mechanics, pricing or small-crew sentiment. Zuper is generally positioned mid-market/enterprise, but that positioning was not verified in this research.
- Method CRM and Markate: not researched; nothing notable surfaced in searches.
- ServiceTitan pricing and minimum size were not retrieved; its features are labelled enterprise here based on the account-manager-gated configuration its own docs describe, not on published pricing.
