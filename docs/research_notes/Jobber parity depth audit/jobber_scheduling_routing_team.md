# Jobber scheduling, dispatch, routing, team and field-app features (state as of Nov 2026)

Research notes for a Jobber-parity CRM aimed at a small residential snow-removal / yard-care crew in Calgary. Primary sources are Jobber Help Center articles fetched 27-28 Nov 2026. Jobber is mid-migration from a "Legacy Schedule" to a "New Schedule"; accounts created on or after 12 Nov 2025 are New Schedule only, so the New Schedule is treated as the baseline and legacy behaviour is noted where it differs.

Reader caveats:
- Help Center pages were read through an automated summariser, so wording is paraphrased; numeric limits and labels quoted here were each present in the fetched page text, but exact UI strings should be re-checked before being copied into a spec.
- productupdates.getjobber.com and community.getjobber.com returned HTTP 403 to direct fetches; items from those sites come from search-result snippets only and are marked as such.
- No Reddit threads were retrieved (searches returned none). Complaint evidence is from Jobber's own community forum snippets, Capterra/G2 snippets and third-party reviews.

---

## 1. Schedule views (day, week, month, list, map, dispatch board), filters, colours, calendar sync, item types, availability, double-booking

### Takeaway
The New Schedule (web) has Month, Week and Day views (Day is switchable between a vertical per-team-member column board and a horizontal timeline), with Map and Unscheduled as side drawers rather than separate views; List view was dropped and Day Sheets were announced as retired (but see contradiction below). Conflict handling is a soft warning only: there is no hard block on double-booking, and availability-aware slot finding ("Find a Time") is gated to Grow/Plus.

### Cited Findings

**View inventory**
- New Schedule (Jobber.com): views are Month, Week, Day; supplemental panels are Map and Unscheduled visits. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Mobile app has five views: Day, List, 3 Day, Week, Map. Map shows one day at a time; 3 Day shows today plus next two days; Week has a "Hide weekends" option (greyed out in 3 Day). — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)
- Legacy schedule had Month, Week, Day, Map and List views. — [Schedule Overview (legacy)](https://help.getjobber.com/hc/en-us/articles/115009233447-Schedule-Overview)
- Accounts created on or after 12 Nov 2025 are on the New Schedule. — [Route Optimization Through the Settings Menu](https://help.getjobber.com/hc/en-us/articles/115009785148-Route-Optimization-Through-the-Settings-Menu)
- List view "will not be carried over"; Jobber's workaround is the Jobs list filtered by status "late". Jobber says it plans better visibility of incomplete/overdue work. — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/)

**Day view (the dispatch board)**
- Vertical (default): one column per team member, anytime visits at the top of each column, unassigned items on the left. Horizontal: team members plus an "Unassigned" row down the left, appointments as bars spanning their duration; a separate "Anytime" column shows a count per person which expands on click. — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule); [New Schedule](https://help.getjobber.com/en/articles/new-schedule/)
- Drag to another team member = reassign; drag within the day = retime; drag an edge = resize. Cross-day moves are not possible from Day view. — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule)
- The Team filter controls which columns appear in the vertical view. — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule)
- New items created by clicking an empty slot default to **anytime**; untick "Anytime" to set start/end. Default type is job (alternatives: request, task, event). — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule)

**Week and Month views**
- Week view: columns are days, with an anytime section at the top of each day; the help article also describes "each team member or route gets its own row". Drag between days to reschedule, drag an edge to resize, reassign via Edit (not by dragging). — [Week View (New Schedule)](https://help.getjobber.com/en/articles/week-view-of-the-schedule-new-schedule/)
- Week-view overlap layout is a per-user setting: "Nested" (overlapping appointments arranged within the time block) or "Stacked" (single column, gaps easier to see). — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Month view: anytime visits sit at the top of each day; drag to reschedule; team changes via Edit. — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/)
- Weekend hide/show toggle exists in Month and Week only; hiding widens weekdays. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)

**Unscheduled drawer**
- Lists visits with no date/time. Sort options: oldest first (default), newest first, client name A-Z / Z-A, highest value, lowest value, manual drag order. Sort preference is saved per user, except Manual order which is saved account-wide. — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/)
- Drag from the drawer onto the calendar to schedule; drag a scheduled visit back to the drawer to clear its date/time. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- With the Unscheduled drawer open, unscheduled visits are also plotted on the map so nearby work can be slotted into a route. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Three visit states: Scheduled (date + time), Anytime (date, no time), Unscheduled (neither; created via "Schedule later" + "Add an unscheduled visit to the calendar"). Any visit can be converted between states by editing date/time. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- In the mobile app, unscheduled visits do not appear on the schedule (only in the job's visit list), except optionally on the Map view via "Show unscheduled appointments on map view". — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)

**Map drawer**
- Shows appointments for the selected day/week/month; hover highlights; pins use the team member's calendar colour; expand arrow widens the panel. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- The number on each pin is the count of visits at that property for the week. Unassigned appointments show a red pin with a crossed-out person icon. — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule); [Week View (New Schedule)](https://help.getjobber.com/en/articles/week-view-of-the-schedule-new-schedule/)
- Multi-select by click or click-and-drag works on the map as well as the calendar (used for bulk reschedule/reassign). — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)

**Filters**
- Type (visits, events, tasks, requests), Team (multi-select), Status (Overdue = past and not complete; Completed; Upcoming; "Confirmed by client" toggle, where on = confirmed and unconfirmed both shown, off = only unconfirmed shown). All multi-select with Clear. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)

**Item types and colour coding**
- Default colours when no calendar colour is assigned: visits green, tasks blue, events yellow, requests/assessments bronze, invoice/quote reminders red. Completed items get a check mark and grey out (or strikethrough, per-user setting, which preserves colour coding). — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Tasks = non-billable items (errands, reminders), assignable. Events = automatically assigned to the whole team (meetings); they auto-grey once their date/time passes. Reminders = invoice and quote reminders. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Calendar colours can be assigned by team member or by keyword/phrase in the item title (e.g. mowing vs mulching). Colours are priority-ranked by drag order; with multiple assignees the colour nearest the bottom of the list wins. Colours show on web Month/Week/Day only, not in the mobile app. Jobber recommends avatars for people and colours for keywords. — [Calendar colors](https://help.getjobber.com/en/articles/calendar-colors)
- Visit titles default to client name + job number; a title template is set in Settings > Work Settings (e.g. include city/postal code). Changing the template overwrites all existing visit titles. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- In the app, events cannot be created and cannot be completed; reminders do not appear in the app at all. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)

**Business hours, working hours, availability, double-booking**
- Business hours (Company Settings) render white; outside hours are muted; the view auto-zooms to business hours. Working hours are per team member in Manage Team. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- "Find a Time" (Grow and Plus only): a "Show availability" toggle (on by default in Day and Week) highlights open gaps. A slot is available if it is inside the member's working hours, not occupied by visits/tasks/requests, and long enough for the appointment. Adding a client triggers drive-time calculation which removes slots that cannot fit travel. Gaps show combined team availability; "+Assign" shows per-member availability. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Drive time in Find a Time: turn-by-turn routes plus historical traffic; Week view shows a range of drive times in the corner of each gap; +Assign shows each member's drive time; after assignment it splits into previous-to-new and new-to-next; shortest-drive slots/assignees highlighted green. Only between consecutive appointments: travel from/to home or HQ for first/last appointment is not included. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Two warning states: "Unavailable" (conflicting appointment) and "Unfeasible" (not enough travel time from previous appointment). — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- When duplicating a visit, a conflicted team member's name turns red; user must reassign or pick another time. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- Third-party review: Jobber has no hard block on scheduling conflicts; it relies on the user catching them. — [Connecteam review](https://connecteam.com/reviews/jobber/)
- Time off has no dedicated object: the documented method is to create a **task** (or visit) with start/end times assigned to the member. A calendar **event** does not block online booking. — [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/); [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)

**Calendar sync**
- One-way only (Jobber to external calendar) via a subscribed-calendar URL. Selectable content: tasks, reminders, events, visits, requests, unassigned items, items assigned to everyone. Window: 2 weeks past to 20 weeks future. Google refreshes about every 12 hours (no manual refresh) and pauses the sync above 1,111 items; Apple Calendar as often as every 5 minutes. Must be set up on Jobber.com, not the app. — [Calendar Syncing](https://help.getjobber.com/hc/en-us/articles/115009378687-Calendar-Syncing)
- A Google Calendar job import exists but is a one-time import, not a sync. — [Import Your Jobs from Google Calendar](https://help.getjobber.com/hc/en-us/articles/28284225711895-Import-Your-Jobs-from-Google-Calendar)

**Day sheets**
- Printable/emailable per-team-member daily summary from Day view > More > Day Sheets: job description, visit date/time, client name/address/phone, optional property map, visit line items, notes (if permitted), optional blank notes area and custom text. PDF page 1 is an overview (appointment count, first start, last end, assignments per member). Only scheduled and assigned items appear. — [Day Sheets](https://help.getjobber.com/en/articles/day-sheets/)
- Conflict: the New Schedule article says day sheets are being retired, with the app / calendar sync as replacements — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/); contradicted by the New Schedule Day View article, which documents More > Day Sheets, and Schedule Settings which links to day sheets — [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule). A product update titled "New Schedule: More customization, plus tools you already rely on" exists (search snippet only) — [Product Updates](https://productupdates.getjobber.com/122937-new-schedule-more-customization-plus-tools-you-already-rely-on).

### Inferences
- Day sheets appear to have been restored to the New Schedule after user push-back; the "retired" statement in the New Schedule article is probably stale. Treat as "exists, day-view only".
- The New Schedule article's "Planned features (not yet available)" list (route lines on map, visit counts, bulk reassign/reschedule, bulk visit creation) is stale: all four are documented as shipped in other articles.
- A parity build needs three distinct visit states (scheduled / anytime / unscheduled) and an "unassigned" lane; anytime-by-default is the Jobber norm for route-based work like snow and mowing.
- Jobber's biggest structural gaps here are things a small-crew product could beat: no real time-off object, no hard double-booking block, no two-way calendar sync, no list/agenda view on web, colours not shown in the app.

### Gaps
- Maximum number of team-member columns in Day view: not documented.
- Whether Month view shows more than N items per day ("+3 more" behaviour): not documented.
- No source found for a statutory-holiday or company-closure calendar.
- Exact permission needed for each schedule action (drag, bulk move) is not documented beyond the Schedule permission levels in section 7.

---

## 2. Recurring scheduling: rules, generation, editing one vs. all, skipping, bulk moves (weather), seasonal pauses

### Takeaway
Recurring jobs pre-generate every visit for the whole contract duration at creation (not a rolling horizon), with weekly / biweekly / monthly / custom rules plus an "As needed" mode that generates nothing; edits are per-visit, "save and update future visits", or "Edit All Visits" (which regenerates incomplete visits and wipes per-visit customisation). Weather delays are handled by a generic bulk "Reschedule & reassign" tool with no client notification, and snow is handled by a dedicated bulk "Create New Visits" tool capped at 100 jobs per run; there is no pause/skip/season concept.

### Cited Findings

**Recurrence rules**
- Repeat options: weekly, biweekly, monthly, custom. Custom can recur weekly, monthly or annually and select multiple days (e.g. Mon + Wed, or 1st and 3rd Friday). "As needed - we won't prompt you" creates no visits; visits are added later. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- Duration: "Ends after" (N days/weeks/months) or "Ends on" (date). Jobber recommends ending recurring jobs within a few years because longer schedules create many more visits and slow create/edit. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- The schedule section shows a summary: number of visits, first and last visit dates, repeat pattern. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- First visit may not be on the start date (start 1 Jan + Wednesday rule = first Wednesday after). The Recurring Jobs report shows the job start date, not first visit date. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- Visits inherit job title, instructions, assigned team and line items. Start/end times optional; none = anytime visits. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits); [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- Jobs page has an "Ending within 30 days" status filter to find contracts needing renewal. Extending = Edit All Visits > change Ends on/after > Update Incomplete Visits. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- A job supports up to 100 line items. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)

**Billing coupling (affects visit semantics)**
- Per visit (each visit's line items invoiced) vs fixed price (same amount per invoicing period regardless of visit count). Invoice timing: monthly on last day, after each completed visit, as needed (no reminders), once job is closed, or custom schedule. Custom per-visit line items do not carry to invoices on fixed-price jobs. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- Automatic payments: toggle on the job; needs a card on file; invoice created on schedule and card charged. Select plans. — [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)

**Editing one vs. future vs. all**
- Editing a visit changes only that visit. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- "Save and update future visits" pushes selected settings via checkboxes: title, time of day, repeats (recurring only), assigned team, line items. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- "Update future visits" does not carry checklists; use Edit All Visits for that (applies to incomplete visits only). — [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists)
- "Edit All Visits" (job > Scheduled visits) changes start date, frequency, end, arrival window; "Update Incomplete Visits" applies. Editing a job's schedule **regenerates** visits and overwrites customised details (e.g. instructions) on incomplete visits; Jobber requires an "I understand" checkbox. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- In the mobile app, changes to line items, schedule and team on a visit affect only that visit. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)
- The job flags any visit whose line-item quantities differ from the job's base items. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)

**Bulk move / weather delay**
- New Schedule: More > "Reschedule & reassign". Select appointments by click or drag-select on calendar or map (count shown); choose "Reschedule to" a date or set to unscheduled; choose "Reassign to"; Confirm. On error, "Try again" keeps selections. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Search snippet of a product update describes shifting selected appointments "by a set number of days at once". — [Product update: More control over unscheduled work and rescheduling](https://productupdates.getjobber.com/152349-new-schedule-more-control-over-unscheduled-work-and-rescheduling) (snippet only; page returned 403)
- Client rescheduling notifications are **not** triggered by bulk reschedule/reassign. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)
- Job-level "Move dates": tick visits in the job's scheduled visits, change the first, and Jobber offers to shift all selected by the same number of days. Documented as only available for one-off jobs. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- Duplicate visit (New Schedule only): copies client, address, title, instructions, line items, team onto the same job; date/time or unscheduled. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)
- Completing a visit from the schedule offers "Schedule New Visit" (follow-up visit with same details); not offered when completing from the job page. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)

**Snow workflow (bulk visit creation)**
- Model: one recurring job per property per season with repeat = "As needed"; job = contract, visit = one service day. End condition advised to be longer than expected. — [Create New Visits for Existing Recurring Jobs (Snow Removal Workflow)](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)
- Tool: any calendar view > More > "Create New Visits". Shows matching recurring jobs on a map with filters: jobs with no incomplete visits before a chosen date; text in job description; line items; client tags. Select All or individual jobs > Next > set visit start date (default today), users to assign, instructions applied to every new visit > "Let's create some visits". — [Snow Removal Workflow](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)
- Limits: up to 500 jobs displayed; visits generated for up to 100 jobs per run (batch with filters beyond that). — [Snow Removal Workflow](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)
- Depth tiers: Jobber's guidance is to create a separate job per rate tier (light vs heavy snow) and pick the matching job by line-item filter. Zones are modelled as client tags. — [Snow Removal Workflow](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)
- Billing: per-visit jobs bill from each visit's line items (per-push); fixed-price jobs bill job line items regardless of visit count (seasonal flat rate). — [Snow Removal Workflow](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)
- User complaints (snippets): snow operators want reusable fixed routes and on-demand snow routing without rebuilding each time; one owner called snow the hardest part to dispatch. — [G2 reviews](https://www.g2.com/products/jobber/reviews); [Capterra reviews p.44](https://www.capterra.com/p/127994/Jobber/reviews/?page=44); [Capterra reviews p.2](https://www.capterra.com/p/127994/Jobber/reviews/?page=2)

### Inferences
- Visits are materialised up front for the whole "Ends after/on" span; there is no rolling generation window. The "keep it under a few years" advice and the visible total-visit count both point to this. A parity build can do the same or choose a rolling window, but must then handle "Ending within 30 days"-style renewal prompts differently.
- There is no first-class skip, pause, or seasonal-suspend. Skipping is done by deleting or unscheduling the single visit; a seasonal pause is done by ending the job and creating a new one (or using two seasonal jobs per property). This is a clear place to exceed Jobber.
- There is no snow-trigger automation (weather feed or accumulation threshold) and no per-event object: a "snow event" is just a batch of visits created on one date. Tier pricing by depth requires duplicate jobs per property, which is clumsy for a Calgary operator with trace / 2 cm / 5 cm+ tiers.
- Bulk moves do not notify clients, so a weather-delay flow in Jobber needs a separate mass message; a parity product could bundle "move day + notify affected clients".

### Gaps
- Exact wording/behaviour of "shift by N days" in Reschedule & reassign could not be confirmed from the help article (product-update page blocked).
- Whether "Create New Visits" guards against duplicate visits on the same date, or includes jobs past their end date: not documented.
- Plan gating of "Create New Visits": not stated.
- Whether "Move dates" really remains one-off only on the New Schedule: single source.
- developer.getjobber.com schema details for Visit / recurrence objects could not be retrieved (the schema is browsable only through authenticated GraphiQL); no field-level data model is cited here. — [Developer Center](https://developer.getjobber.com/docs/)

---

## 3. Routing: optimisation, limits, start/end, re-optimising, drive time, map, GPS, geofencing

### Takeaway
New-Schedule route optimisation is an admin-only, web-only, on-demand reorder of **anytime** visits using real driving distance, for one or more team members over up to 7 days, with only "keep first / keep last stop" as start/end control; the legacy "master route" template is gone for new accounts. Jobber has no continuous live crew tracking (only action-triggered GPS waypoints), and live vehicle location requires paid third-party hardware (FleetSharp in US/Canada, Force in US only).

### Cited Findings

**New Schedule route optimisation**
- Reorders anytime visits (no set start/end time) to reduce backtracking; uses actual driving distance rather than straight-line; based on the visits on the selected days, not a fixed master route; can be rerun whenever the schedule changes. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- Only admin users can optimise. Runs on Jobber.com only; the app shows the resulting order but cannot run the optimiser. Plans: Connect, Grow, Plus. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- Available from vertical Day view and Week view via the "Optimize anytime appointments" icon; choose dates (up to 7 days at once) and one, several or all team members. Timed visits are excluded. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- Start/end control: checkboxes "Keep first appointment at start of route" and "Keep the last appointment at end of route"; or drag a visit to top/bottom before running; to use the office/shop as a stop, create an anytime visit for the office and pin it first/last. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- Map drawer shows routes as directional lines per team member; in Week view hovering an appointment highlights its route; shared appointments show each member's line. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- No maximum stop count is stated. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/)
- In the app, Day view anytime visits are ordered by the routing set on Jobber.com; the app documents no reorder. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)

**Legacy routing (pre-12 Nov 2025 accounts on Legacy Schedule)**
- Master route = account-wide template ordering all properties for anytime work; Settings > Route Optimization > Optimize builds the shortest route through all properties; manual ordering via "Start Routing From Here", "Insert at this Point", "Remove from Route", "Reset Route". Shown in calendar Map view and the app. Connect/Grow/Plus. — [Route Optimization Through the Settings Menu](https://help.getjobber.com/hc/en-us/articles/115009785148-Route-Optimization-Through-the-Settings-Menu)
- Daily route: Map view > click pin > "Route From Here"; drag to reorder in the side list; overrides the master route for that day. Items must be assigned and anytime. Blue lines show order (need at least two anytime visits); clicking a team member highlights their route in red. — [Daily Route Optimization (legacy)](https://help.getjobber.com/hc/en-us/articles/115009542508-Daily-Route-Optimization)
- Unlocatable addresses show a red map icon; fix via property > More > "Adjust map pin location" (drag pin, use current location, or enter lat/long). — [Daily Route Optimization (legacy)](https://help.getjobber.com/hc/en-us/articles/115009542508-Daily-Route-Optimization)
- Search summary of legacy help text states the master optimisation is Google-Maps based and could only be run twice a day; this was not present in the fetched article text. — [How to Route](https://help.getjobber.com/hc/en-us/articles/360033836293-How-to-Route) (search snippet; unverified)

**Drive time**
- Drive time appears in Find a Time (Grow/Plus) and in online booking slot filtering; based on turn-by-turn routes and historical traffic (online booking article names TravelTime as the estimate provider). — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/); [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)

**GPS waypoints (not live tracking)**
- A waypoint is recorded only when a team member (with device location on) clocks in/out of the general timer, starts/stops a visit timer (manual or via location timer), adds a note/attachment to a client/request/quote/job/invoice, or completes a visit/assessment/task. Not continuous. Plans: Connect, Grow, Plus. — [GPS Waypoint Tracking](https://help.getjobber.com/hc/en-us/articles/115009612507-GPS-Waypoint-Tracking)
- Visible in Insights > Reports > GPS Waypoints (per date, grouped by team member), on the Day-view map for today's date only (not week/month), and via a map-pin icon on timesheet entries in Day view. Pins show member, time, action; hover shows an accuracy circle. — [GPS Waypoint Tracking](https://help.getjobber.com/hc/en-us/articles/115009612507-GPS-Waypoint-Tracking); [Day View (New Schedule)](https://help.getjobber.com/hc/en-us/articles/36603691932951-Day-View-of-the-Schedule-New-Schedule)
- Waypoints are not recorded for manually created time entries. — [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets)
- Jobber states live location is not shared with other team members or the account owner. — [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App)
- App Map view shows the user's own position as a blue dot (if location enabled) and team members across the top with daily appointment counts; no live teammate positions documented. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)

**Geofencing**
- Geofences exist only for location timers: trigger within 200 m (656 ft) of the visit's geofence; see section 6. — [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App)

**Savings claims**
- Jobber's public routing pages make qualitative claims only (minimise fuel cost, travel time, vehicle wear); no Jobber-published percentage was found. — [What is route optimization (Jobber Academy)](https://getjobber.com/academy/what-is-route-optimization/); [Routing feature page](https://getjobber.com/features/routing/)
- Jobber claims the New Schedule + Find a Time can cut scheduling time "by up to 90%" (search snippet of product-updates feed). — [Product Updates](https://productupdates.getjobber.com/?page=2) (snippet only)

**Complaints**
- Forum thread title/snippet: routing appeared to use "as the crow flies" distance rather than driving paths; one lawn operator said routes set for a weekday did not persist across the mowing season; another said the new schedule removed the ability to route specific days / start from a specific property; another said the endpoint option does not stop routes doubling back. — [Jobber Community: how does Jobber calculate routes](https://community.getjobber.com/discussions/job-details-scheduling/how-does-jobber-calculate-routes-and-can-it-use-real-driving-directions-instead-/8663); [Jobber Community: Routing](https://community.getjobber.com/discussions/job-details-scheduling/routing/7596) (snippets only; pages returned 403, dates unknown)
- Capterra reviewer: map connects stops dot-to-dot rather than street-by-street. Capterra comparison rates Jobber route optimisation 3.8 vs OptimoRoute 4.7. — [Capterra Jobber reviews](https://capterra.com/p/127994/Jobber/reviews/); [Capterra Jobber vs OptimoRoute](https://www.capterra.com/compare/127994-161579/Jobber-vs-OptimoRoute)
- Third-party blog: Jobber overhauled route optimisation in October 2025 (whole-team optimisation, mid-day re-optimise) but still trails dedicated tools. — [FieldTradePro review](https://fieldtradepro-astro.pages.dev/blog/jobber-review) (single low-authority source)

### Inferences
- The straight-line complaint probably predates the New Schedule optimiser, whose help article explicitly says driving distance; the forum threads could not be dated.
- Key Jobber routing weaknesses for a snow/yard crew: (a) no true depot start/end (workaround is a fake "office" visit), (b) no persistent named route per weekday or per zone, so recurring order is not remembered and must be re-optimised, (c) timed visits are ignored rather than treated as time-window constraints, (d) crew cannot reorder or optimise in the field, (e) non-admin dispatchers cannot optimise, (f) no per-leg drive time or route ETA shown on the route itself, (g) no priority ordering (e.g. seniors/commercial first after snowfall).
- "Up to 7 days" plus "one or all team members" indicates sequence optimisation within each person-day, not load balancing across crews or days; the help text never says stops are moved between people or days.

### Gaps
- Maximum stops per route, the solver used, and whether live traffic is used for optimisation: not documented.
- Whether optimisation can be undone: not documented.
- Whether total route distance / drive time is displayed after optimising: not documented.
- No source confirms any Jobber-native live crew-phone tracking; absence is inferred from the waypoint and privacy statements.

---

## 4. Dispatch and client notifications

### Takeaway
Crew dispatch is push-notification based ("Today's schedule changed"), with client messaging built from manual booking confirmations, up to two automated reminders per visit, a manual "On my way" text with a chosen ETA (5-60 min), and an optional per-move reschedule notice; client self-reschedule exists only through the paid AI Receptionist. Texting is US/Canada/UK only, so it works for Calgary.

### Cited Findings

**Assignment**
- Team members added to a job are assigned to every visit; assigning on one visit affects only that visit unless "save and update future visits" is used. With no users selected, visits stay unassigned and appear in the Unassigned lane / red map pin. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits); [Create a Recurring Job](https://help.getjobber.com/hc/en-us/articles/115009542848-Create-a-Recurring-Job)
- In the app, tapping a teammate's empty slot auto-assigns that teammate; users with scheduling permission can reassign unscheduled items to nearby team members from the map. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)
- Unassigning a user's seat removes them from all incomplete visits and tasks (reassign first). — [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/)

**Crew push notifications (app)**
- Types: Location timers (near a visit); Today's schedule changed (new, removed, deleted or rescheduled assessments/tasks/visits); New request (admins); Client message (admins or two-way text permission); Client viewed quote (admins); Active timer (lock screen). — [Jobber App Basics](https://help.getjobber.com/hc/en-us/articles/7061327071639-Jobber-App-Basics)

**Booking confirmation**
- Sent manually ("Save and..." on a job, or from the request/job), separate text and email templates, includes client hub link by default; supports {{JOB_DETAILS}} and {{ARRIVAL_WINDOW}}. — [Emails and Text Messages Settings](https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings); [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/)

**Visit / assessment reminders**
- Connect, Grow, Plus. Email everywhere; text only US, Canada, UK and only to numbers in the account's country. Up to two scheduled reminders (any mix of text/email), each relative to the appointment or at a fixed time of day; company time zone. Can take up to an hour to queue. If a visit is created/moved inside the reminder window, the overdue reminder sends immediately. — [Assessment and Visit Reminders](https://help.getjobber.com/hc/en-us/articles/360033608974-Assessment-and-Visit-Reminders)
- Anytime visits: text reminders only send if a specific reminder time is set (to avoid late-night texts); Jobber suggests e.g. 9:00 AM the day before. — [Assessment and Visit Reminders](https://help.getjobber.com/hc/en-us/articles/360033608974-Assessment-and-Visit-Reminders)
- Text template limit 160 characters; emojis and URLs not supported in reminder templates. Per-client opt-out ("Upcoming assessment or visit reminders") and per-phone "Receives messages" toggle. Manual reminders (visit > More Actions > Text/Email Reminder) send in addition to scheduled ones. — [Assessment and Visit Reminders](https://help.getjobber.com/hc/en-us/articles/360033608974-Assessment-and-Visit-Reminders)
- Conflict: the settings article says 160 characters is a guideline and longer texts send split into multiple messages. — [Emails and Text Messages Settings](https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings)

**Client confirmation**
- Clients confirm via client hub link ("Confirm Appointment") or by replying "Yes" or "C" to a text reminder; email recipients cannot confirm by email reply. Confirmation shows in activity feed, client profile, job visits section, visit details, and drives the "Confirmed by client" schedule filter. — [Assessment and Visit Reminders](https://help.getjobber.com/hc/en-us/articles/360033608974-Assessment-and-Visit-Reminders)
- Account-wide toggle "Include Client Hub links in appointment messages" covers booking confirmations, reminders, reschedule notices and On My Way texts (useful for tenants/site contacts). — [Emails and Text Messages Settings](https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings)

**On My Way**
- App only, manual: open visit > On My Way > choose contact (primary by default, others selectable) > ETA of 5, 10, 15, 20, 25, 30, 45 or 60 minutes > Send Text. Last ETA becomes default. Message includes a callback number: the sender's profile phone if set (unless it is their Jobber Payments 2FA number), otherwise the company office number. With two-way texting, sent from the dedicated number and replies land in the message centre; without it, replies get a "do not reply" auto-response. Select plans; US, Canada, UK. — [On My Way Text Messages](https://help.getjobber.com/hc/en-us/articles/7448087796631-On-My-Way-Text-Messages-in-the-Jobber-App)
- Live-tracking link in On My Way texts exists only via the Force Fleet Tracking integration (US only): requires the sender be assigned to a vehicle with a GPS update in the last 12 hours; link expires at the earliest of 2 hours after tap, scheduled visit end, or visit completion. — [Jobber and Force Fleet Tracking](https://help.getjobber.com/en/articles/jobber-and-force-fleet-tracking/)

**Arrival windows**
- Connect, Grow, Plus. Default set in Work Settings: None (default), 15 min, 30 min, 1, 2, 3 or 4 hours. Style: "Add window after start time" (9:00 start = window begins 9:00) or "Center window" (2 h at 9:00 = 8:00-10:00). — [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/)
- Set per job, not per visit: one window applies to all visits. Not available for anytime or "schedule later" jobs, nor for assessments. Change on existing jobs via Edit All Visits > Update Incomplete Visits. Changing the default affects only jobs created afterwards. — [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/)
- Shown in client hub, booking confirmations and reminders ({{ARRIVAL_WINDOW}}), app visit heading and web visit details; the web calendar block shows only the start time. In the app a window can only be added while creating a job. — [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/)

**Reschedule notifications**
- Trigger: dragging a visit, resizing it, or Edit Visit. "Notify client?" prompt: don't notify / text / email, with editable message. Only the changed visit on recurring jobs. Old reminders auto-cancelled and re-scheduled. Not for assessments; not for bulk reassign/reschedule. Anyone who can reschedule can send or skip. — [Schedule Overview (New Schedule)](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/)

**Client-initiated reschedule / cancel**
- Client hub lets clients approve quotes, view appointments, pay invoices, request work; no client-hub reschedule button was found. — [Client Hub Settings](https://help.getjobber.com/en/articles/client-hub-settings/) (search snippet)
- AI Receptionist (phone/text; US, Canada, UK) can book, reschedule and cancel for clients. Rescheduling requires online booking enabled. Cancelled appointments become unscheduled (details kept, cancellation note added). It can state the caller's next appointment in the greeting. Included in Plus (unlimited conversations); $99/month add-on on Core/Connect/Grow with 100 conversations and $0.79 per extra. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)

**Other**
- Job follow-up email (optional survey) can send automatically on job completion; email only. Per-visit "visit completed" client notification is not listed among notification types. — [Emails and Text Messages Settings](https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings)
- Two-way texting (shared dedicated number, calls forward to company phone) is Grow and above. — [The Grow Plan](https://help.getjobber.com/hc/en-us/articles/360050124513-The-Grow-Plan)

### Inferences
- For route-based anytime work (the snow/mowing norm), Jobber's client comms are weak: arrival windows are unavailable for anytime visits, text reminders need a fixed clock time, and there is no automatic "we're next / on the way" based on route progress. A parity product could auto-send "on the way" when the previous stop is completed and a "service completed" text with photo.
- No documented "visit completed" client notification per visit means snow clients are not natively told their driveway was cleared unless a Grow-tier custom automation is built (automation builder not researched in depth here).
- Booking confirmations are manual, not automatic on scheduling (online bookings excepted).

### Gaps
- Whether the Grow "custom automation builder" can send a text on visit completion: not researched; no source.
- Exact default wording of On My Way and reminder templates: not captured.
- Whether crew get a push notification for future-day assignments (only "today's schedule changed" is documented).

---

## 5. Online booking scheduling rules

### Takeaway
Online booking (all plans) computes slots from business hours, per-member online-booking availability, existing visits/tasks/requests, service duration, a booking interval, and one of three spacing modes (drive-time limit, fixed buffer, or none); the assignee is chosen at random among eligible members. It can create only assessments or one-off jobs, never recurring work.

### Cited Findings
- Available on all plans; admin-only settings under Settings > Requests and bookings. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Two booking types, one per form: assessment booking (creates request + assessment) or job booking (auto-converts to a scheduled one-off job). If a client picks both assessment and job services, it books as an assessment. Optional "Require assessment booking approval" shows "request sent" until accepted. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Settings: earliest availability (e.g. 1 business day blocks same-day); booking interval (slot increments from start of business hours); service duration 15 minutes to 12 hours (set on form or in Products & Services); quantity min/max with duration and price scaling by quantity; arrival windows applied to displayed slot time if enabled. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Spacing modes: (1) Drive time limit: only offer slots within a set drive time of other bookings that day, based on client address (address field required) using TravelTime historical-traffic estimates; (2) Fixed buffer between all appointments regardless of location; (3) No restrictions (back-to-back). — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Drive-time edge cases: a day with no existing appointments shows all slots regardless of location, and the first booking becomes the anchor; drive time resets at midnight local time (previous day and overnight jobs ignored); only members within max drive time are eligible. Drive-time calculation limited to select countries including US, Canada, UK, Australia. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Service area: optional postal/zip gate with radius; out-of-area clients are told to contact the business. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Assignment: automatic; if several members are available, chosen at random. Per-member "availability for online booking" by weekday with start/end, bounded by business hours. Tasks/visits block; events do not. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking); [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/)
- After booking: admins get activity-feed + email notification; booking gets a special icon on schedule/jobs/app; client notes go to Instructions; uploaded files become an internal note; client gets confirmation screen + email with client hub link showing date, arrival time, duration, address, services/cost, assigned team. Slot times display in the client's device time zone. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Limits: up to 100 services shown; up to 4 uploads per booking (each under 10 MB, 40 MB total; JPEG/PNG/HEIC/PDF); card-on-file field requires Jobber Payments and is not supported in embedded forms; product images not shown in booking. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)
- Distribution: share link, embed code, Google Business Profile booking link (up to a week to appear), GA4 tracking. — [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking)

### Inferences
- No capacity model beyond one-booking-per-person-per-slot: no "max bookings per day", no crew-level (two-person) booking, no skill matching, no load balancing (random pick).
- No recurring-service sign-up (e.g. weekly mowing or a seasonal snow contract) through online booking; that still needs quote-to-job conversion. This is a notable gap for the target business.
- Availability ignores home/shop travel and yesterday's schedule, so first-slot-of-day placement is location-blind.

### Gaps
- Latest-bookable horizon (how far ahead clients can book) and deposit-at-booking rules were not found in the article.
- Whether booked slots honour Find-a-Time "working hours" or only the separate online-booking availability is not explicit.

---

## 6. Time tracking and timesheets

### Takeaway
Timesheets (Connect and up) use a single running timer per user that flips between a general (clocked-in) timer and visit timers; Grow adds geofenced location timers (200 m, auto-start or reminder mode) and job costing with per-user loaded labour rates; Plus adds crew clock-in, labelled categories and breaks. Approval is a date-cutoff bulk approve that locks entries and triggers Gusto / QuickBooks sync; there is no overtime logic documented.

### Cited Findings

**Timers**
- Clock In on app home starts the general timer; "Start Visit" swaps to a visit timer and the general timer resumes when the visit timer stops. Only one timer at a time. Completing a visit does not require stopping the timer; a completed visit must be reopened to time again. Assessment timers can only start on the current date. — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)
- Entries belong to the date the timer started; a timer left past midnight can get stuck and must be stopped from Jobber.com Timesheets. No auto-stop documented. — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)
- Manual entry fields (app): team member, date, start/end, category, visit/assessment, note. Notes cannot be added while a timer runs. — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)
- Plus only: Driving, Office, Supplies, Break labels plus up to 6 custom labels; crew control (clock in/out and start/stop visit timers for selected crew members from one phone; needs internet and "edit everyone's time" permission; same start/stop time written for each member). — [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets); [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)
- Unpaid break hours and custom labels do not sync to Gusto or QuickBooks; only paid hours sync. — [Track Time Categories and Breaks](https://help.getjobber.com/en/articles/track-time-categories-and-breaks/) (search snippet)
- iOS Live Activities / Dynamic Island (iPhone 14 Pro+), Apple Watch/CarPlay surface, Android 16+ Live Updates for the active timer. — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)

**Location timers (geofence)**
- Grow and Plus. Account-wide admin setting (Settings > Location Services) with two modes: Automatic (timer starts on arrival) or Reminder (push prompt to start/stop, actionable from lock screen). — [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App)
- Trigger radius 200 m (656 ft) of the visit geofence; stop can lag up to 3 minutes after leaving. Auto-start requires the user be assigned to the visit. With multiple nearby visits the user gets a reminder to pick manually even in automatic mode. Visits only, not assessments. General timer stops on arrival and resumes on departure. — [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App)
- Requires Schedule permission (at least view and complete own) and Time tracking (at least record own); device location "Always"; Android also needs physical-activity permission and unrestricted battery. Needs an internet connection: will not fire offline. Only an admin can disable, on Jobber.com. — [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App)

**Web timesheets, approval, payroll**
- Day and Week views with team filter; clock a team member in from the web (choose job/assessment/category, adjust start time); manual "Add entry"; while a timer runs only notes and start time are editable; per-entry edit history (who, when, field, old/new; changes from 5 Jun 2026 onward). Deactivated members still appear for periods where they tracked time. — [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets)
- Approve Timesheets tab: slider sets a cutoff date; tick one or more team members; Approve. Approved entries are locked for most users; admins or users with "view, record, and edit everyone's" can approve and edit approved time (banner shown). Connect/Grow/Plus. — [Approving Timesheets](https://help.getjobber.com/hc/en-us/articles/115009614247-Approving-Time-Sheets)
- Three-step flow: Timesheets > Approve > Confirm Payroll (records employees as paid; cannot be undone; admin-only). Reimbursable expenses appear in Confirm Payroll under "Awaiting Payment"; marking them paid auto-approves unapproved timesheets. — [Approving Timesheets](https://help.getjobber.com/hc/en-us/articles/115009614247-Approving-Time-Sheets); [Expenses](https://help.getjobber.com/en/articles/expenses/); [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Approval triggers sync to Gusto or QuickBooks Online. Gusto: hourly employees only (not salary/contractor/commission), lands in Gusto unprocessed payroll. QuickBooks: requires QuickBooks Payroll, employee names must match exactly, entries spanning midnight are not supported. — [Jobber and Gusto Integration](https://help.getjobber.com/hc/en-us/articles/15370068136727-Jobber-and-Gusto-Integration); [How Items Sync Between Jobber and QuickBooks Online](https://help.getjobber.com/hc/en-us/articles/10487017203223-How-Items-Sync-Between-Jobber-and-QuickBooks-Online-NEW-QuickBooks-Integration) (search snippets)
- Timesheet report (Insights > Reports > Timesheets): hours by user for a date range, entry list, configurable columns, Excel export, decimal hours. — [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets)

**Labour cost and job costing**
- Job costing: Grow and Plus. Profit bar per job = revenue (line items minus discounts, pre-tax) minus line-item costs, timesheet labour (hours x per-user rate) and expenses. Per-user labour cost rate in $/hour (loaded: wages, benefits, taxes) set in Manage Team; rate changes apply only to future time; labour cost computed after the timer stops, using seconds. — [Job Costing](https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing)
- Recurring jobs: costing shows a rolling last-30-days window (per-visit revenue = line price x visits starting in last 30 days; fixed-price = price x invoice reminders in last 30 days). Recurring jobs are excluded from the job-costing report and from Plus "job profit alerts" (one-off only). — [Job Costing](https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing)
- Known limitation: the same cost entered as both a line-item cost and an expense is double-counted. — [Job Costing](https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing)

### Inferences
- Gusto is US-only payroll, so a Calgary operator realistically has QuickBooks Online Payroll or export-to-Excel; a parity product gains little by copying the Gusto path.
- Jobber has no per-season or per-contract profitability for recurring work (30-day window only), which matters for seasonal snow contracts where profit depends on total pushes vs flat fee. This is a strong differentiator opportunity.
- Driving time between stops is not auto-attributed; it falls into "general" time unless Plus labels are used.

### Gaps
- Overtime rules, rounding rules, pay periods, statutory-holiday pay: no documentation found.
- Geofence radius configurability (appears fixed at 200 m): not stated either way.
- Confirm Payroll article was not fetched directly; details above come from adjacent articles.

---

## 7. Team management, permissions, mobile app, offline, forms, photos, payments

### Takeaway
Permissions are four additive presets (Field crew, Senior field crew, Crew lead, Manager) plus an Administrator flag and fully granular custom toggles; the default invite level is Field crew, which hides pricing and other people's schedules. The app covers the field loop (schedule, timers, checklists with photos/signature, notes, on-my-way, invoicing, Tap to Pay) but dispatch-grade tools (optimisation, crews, bulk moves, calendar colours, event creation) are web-only, and offline support is partial.

### Cited Findings

**Presets (each includes the previous)**
- Field crew: view own schedule, mark work complete, add notes/photos on their jobs, start/stop timers. Cannot see others' schedules, pricing/costs, or manually create/edit timesheets. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Senior field crew: adds client files/attachments, prices, create/edit clients, quotes, jobs, invoices, collect payments. Cannot change others' schedules, edit others' timesheets, or view reports. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Crew lead: adds view/change everyone's schedule, add/edit everyone's timesheets, view client communications. No marketing tools or reports. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Manager: adds reports, marketing tools, pipeline. Cannot add/remove team members or change account settings. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Administrator checkbox: all settings; admin-only actions include billing, client import/export, Jobber Payments reports, Home/Insights/Activity Feed, confirming payroll, route optimisation, online booking settings. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Naming conflict: an older help snippet calls the default lowest preset "limited worker"; the current article lists Field crew as default. — [Location Timers search snippet](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App); [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/)

**Granular custom permissions**
- Schedule: view own / view and complete own / edit own (incl. date and time, even with multiple assignees) / edit everyone's / edit and delete everyone's. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Time tracking: start and stop own timers / track, manually enter and edit own / everyone's. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Notes: jobs and visits only / view all / view and edit all / view, edit, delete all. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Clients and properties: name and address only (assigned jobs) / full info (assigned jobs) / view and edit full / view, edit, delete / show clients in menu (enables client search). — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Show Pricing (on/off; prerequisite for creating quotes/invoices/line items); Job costing (needs Show Pricing + everyone's timesheets + everyone's expenses + view all jobs); Payments (needs Show Pricing + edit client info + edit quotes/invoices); Requests/Quotes/Jobs/Invoices/Expenses each with view / create-edit / delete levels and "show on menu"; Client communications; Reports (scoped by other permissions); Files and Media (Plus); Pipeline; Marketing. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions)
- Visit detail hides line-item prices (quantities only) for users without pricing. — [Visits](https://help.getjobber.com/hc/en-us/articles/7924045219479-Visits)

**Seats, team records, subcontractors**
- Invite by name + email (invite also sent by text); invited users consume a seat immediately; email must not belong to another Jobber account. Seats bought in bulk via Manage Seats; unassigning a seat blocks login and strips the user from incomplete work but billing continues until seats are reduced. Core allows one additional seat. — [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/)
- User record fields documented: name, email, phone, permission level, labour cost rate, online-booking availability/working hours, avatar, calendar colour, team custom fields. — [Manage team members and seats](https://help.getjobber.com/en/articles/manage-team-members-and-seats/); [On My Way](https://help.getjobber.com/hc/en-us/articles/7448087796631-On-My-Way-Text-Messages-in-the-Jobber-App)
- No dedicated subcontractor user type was found; subcontractors would be ordinary seats with restricted permissions (Gusto sync explicitly excludes contractor types). — [Jobber and Gusto Integration](https://help.getjobber.com/hc/en-us/articles/15370068136727-Jobber-and-Gusto-Integration) (snippet)

**Crews (new, Plus)**
- Crew scheduling (help article published 8 Sep 2026, updated 6 Nov 2026): Plus only; web only (not in the app). Create crews in Manage Team; a person can be in only one crew; no crew lead; no future-dated membership changes; unlimited crews/members. Assign a crew to a job/visit/task in one action; Day view can display by crew; Team filter by crew in all views. — [Crew scheduling](https://help.getjobber.com/en/articles/crew-scheduling/)
- Moving a person between crews (Schedule > More > Manage crews) updates all their upcoming visits including all future recurring visits, with a preview of visits unassigned/assigned per person; runs in background. Deleting a crew leaves existing assignments. Job import does not support crews. — [Crew scheduling](https://help.getjobber.com/en/articles/crew-scheduling/)

**What crew see / do in the app**
- Home: map + "Up Next" (appointments by start time, anytime last); admins also get To-do and Discover. — [Jobber App Basics](https://help.getjobber.com/hc/en-us/articles/7061327071639-Jobber-App-Basics)
- Visit screen tabs: Visit (instructions, checklists, line items, schedule, team), Details (client, custom fields), Notes. Actions: start timer, complete visit, On My Way, directions (opens maps app), fill checklist, add/edit line items. Camera button on visits opens "Jobber Cam". — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App); [Jobber App Basics](https://help.getjobber.com/hc/en-us/articles/7061327071639-Jobber-App-Basics)
- Quick-create (+): client, expense, invoice, job, quote, request, task (permission-filtered). Search covers 100 most recently updated items. Dark mode. "Rewrite with AI" for client-facing text. — [Jobber App Basics](https://help.getjobber.com/hc/en-us/articles/7061327071639-Jobber-App-Basics)
- Web-only capabilities: route optimisation, crew management, calendar colours, calendar sync setup, event creation, adding a checklist to a single visit, adding an arrival window to an existing job, location-timer admin, request-form customisation. — [Route Optimization (New Schedule)](https://help.getjobber.com/en/articles/route-optimization-new-schedule/); [Crew scheduling](https://help.getjobber.com/en/articles/crew-scheduling/); [Calendar colors](https://help.getjobber.com/en/articles/calendar-colors); [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists); [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/)

**Offline**
- Day's schedule is prefetched on a good connection and kept until logout; in poor connectivity the schedule is read-only. — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App)
- Jan 2026 update: offline support for filling job forms, viewing visit details and notes, and tracking time, with automatic sync; multi-photo capture works offline in forms. — [Jobber product updates (Jan 2026)](https://www.getjobber.com/product-updates/)
- Non-location timers work offline and sync later; not available offline: location timers, historical time entries, weekly totals, crew clock-in. — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App)
- Checklist edits queue on device; More > Status shows Syncing and Failed tabs. Notes/attachments show "Waiting to sync until online" and are lost if the user logs out, force-closes, deletes or updates the app before sync. — [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists); [Notes and Attachments in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447835963159-Notes-and-Attachments-in-the-Jobber-App) (snippet)
- Conflict: one help snippet says visit timers cannot be started or stopped without internet — [Schedule in the Jobber App](https://help.getjobber.com/hc/en-us/articles/6766253760279-Schedule-in-the-Jobber-App) (search snippet); contradicted by the timers article, which says timers work offline — [Timers and Timesheets in the Jobber App](https://help.getjobber.com/hc/en-us/articles/7447924360855-Timers-and-Timesheets-in-the-Jobber-App). The latter matches the Jan 2026 update and is probably current.
- Tap to Pay requires internet for every transaction. — [Tap to Pay](https://help.getjobber.com/en/articles/tap-to-pay/)

**Checklists / job forms**
- Connect, Grow, Plus. Question types: short answer, long answer, dropdown (single), checkbox, number, image upload (up to 10 files per form, each under 50 MB), date, signature. Sections + questions; required flag; up to 100 checklists per account; no conditional logic documented. — [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists)
- Auto-attach to all new jobs and/or assessments; recurring jobs copy the checklist to every visit (each visit has its own copy). Completing a visit with blank required fields only warns; it can still be completed, and an activity-feed notification flags the incomplete checklist. Image markup (draw, shapes, text). PDF email/download to client (manual). Checklists report by date range. — [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists)

**Photos, notes, signatures**
- Notes/attachments on clients, requests, quotes, jobs, invoices; internal by default. Notes permission can limit crew to notes on jobs and visits only. Unlimited photos/videos and the Files and Media permission are Plus. — [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions); [Jobber pricing](https://www.getjobber.com/ca/pricing/)
- Signature capture exists as a checklist question type and for online document signing with "send your client a copy". — [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists); [Emails and Text Messages Settings](https://help.getjobber.com/hc/en-us/articles/9335574672151-Emails-and-Text-Messages-Settings)

**Expenses**
- Manual expense tracking on Connect/Grow/Plus. Fields: date, name (autocomplete), details, amount (negative for credits), reimburse-to team member, linked job, accounting code, receipt image. Receipt auto-fill scanning (up to 25 documents per upload, review queue, PO matching to jobs) is Plus or Bookkeeping add-on. Reimbursements settle through Confirm Payroll. Expenses can be entered in the app. — [Expenses](https://help.getjobber.com/en/articles/expenses/)

**On-site payments**
- Tap to Pay: all plans; US and Canada; needs Jobber Payments and app 6.48+; iPhone XS or later, Android 11+ with NFC, no iPads. Fee 2.7% + 30 cents. Canada: Interac debit not supported and transactions over $250 may exceed tap limits (needs physical reader or manual entry). Tips supported; card cannot be saved on file from a tap. Requires permissions: edit own schedule, edit client info, edit jobs, edit invoices, Show Pricing. — [Tap to Pay](https://help.getjobber.com/en/articles/tap-to-pay/)

### Inferences
- For a 2-5 person Calgary crew, Jobber's most relevant gaps: crews and crew clock-in are Plus-only (the most expensive tier); checklists cannot enforce completion; no conditional form logic; no before/after photo requirement per visit as a first-class rule (only via a required image question in a checklist); Interac not supported for tap, which matters in Canada.
- The permission model's dependency rules (e.g. Payments implies pricing + client edit + invoice edit) are worth copying: they prevent broken permission combinations.
- "Name and address only (assigned jobs)" client visibility is the privacy baseline for seasonal labour.

### Gaps
- No Jobber help article on subcontractors as a distinct concept was found.
- Photo count/size limits outside checklists, and video limits by plan, were not retrieved.
- Notes and Attachments app article was not fetched directly.

---

## 8. Fleet / vehicle / equipment features and integrations

### Takeaway
Jobber has no native fleet, vehicle or equipment management; vehicle visibility comes from two paid GPS-hardware integrations surfaced on the New Schedule map: FleetSharp (US and Canada) and Force Fleet Tracking (US only).

### Cited Findings
- FleetSharp: Connect/Grow/Plus; US and Canada; requires FleetSharp devices (OBD plug-in with SIM) and a FleetSharp subscription; requires the New Schedule. Vehicles appear as icons beside team avatars and on the map drawer, only for team members selected in the Team filter. — [Jobber and FleetSharp GPS Tracking Integration](https://help.getjobber.com/en/articles/jobber-and-fleetsharp-gps-tracking-integration/)
- Vehicles settings tab (admins): optional vehicle name, assigned team members (one vehicle per member), icon colour; read-only make, model, year, VIN, plate from the tracker. Vehicle overview: status (driving / idle / off / syncing / unavailable), nearest address, speed and direction, fuel %, battery voltage, assigned members, link to FleetSharp, last-updated time. Vehicle list syncs nightly (new vehicles appear next day). Route replay, idling, safety and mileage reports live in FleetSharp, not Jobber. — [Jobber and FleetSharp GPS Tracking Integration](https://help.getjobber.com/en/articles/jobber-and-fleetsharp-gps-tracking-integration/)
- Integrations set up before July 2025 are on a legacy version (device name, speed/direction, fuel, mileage, check-engine light; route history in Connected Apps). — [Jobber and FleetSharp GPS Tracking Integration](https://help.getjobber.com/en/articles/jobber-and-fleetsharp-gps-tracking-integration/)
- Force Fleet Tracking (formerly Force by Mojio): Connect/Grow/Plus; US only; not available during trial; OBD-II trackers or dual-facing dashcams; same map/vehicle model as FleetSharp plus live tracking links in On My Way texts (default on for integrations connected on/after 25 Aug 2025). — [Jobber and Force Fleet Tracking](https://help.getjobber.com/en/articles/jobber-and-force-fleet-tracking/)
- Connect plan description lists "Live GPS tracking (FleetSharp)" and "Routing: assign new jobs to the nearest team member on a map, and see where your team is". — [The Connect Plan](https://help.getjobber.com/hc/en-us/articles/12296620144919-The-Connect-Plan)

### Inferences
- For Calgary, FleetSharp is the only vehicle-tracking route; client-facing live tracking links are unavailable in Canada.
- No equipment records (plows, blowers, mowers), maintenance schedules, fuel logs, salt/material usage, or equipment-to-crew assignment exist natively; "equipment needs" are modelled as client tags in the snow workflow. A lightweight equipment/material log per visit would exceed Jobber.

### Gaps
- FleetSharp hardware and subscription pricing: not on the help page.
- Vehicle position refresh interval on the Jobber map: not stated (only the nightly vehicle-list sync is).
- No evidence found of a native chemical/material application log beyond the "chemical tracking" feature mentioned in settings (not researched).

---

## 9. Plan gating and recent releases (2025-2026), AI

### Takeaway
Core is essentially single-user quoting/invoicing/booking; the scheduling/dispatch toolkit (route optimisation, reminders, arrival windows, checklists, timesheets, GPS waypoints, expenses) starts at Connect; Grow adds Find a Time, location timers, job costing, two-way SMS and automations; Plus adds crews, crew timers, time categories/breaks, profit alerts, unlimited media and the AI Receptionist. 2025-2026 releases centre on the New Schedule rebuild, offline mode, crews, and AI (Receptionist, Copilot, Teammate beta).

### Cited Findings

**Pricing (USD; pricing page shows USD only even on /ca/)**
- Annual-prepaid monthly rate (renewal rate in brackets): Core 1 user $21 ($29); Connect 1/5/10/15 users $70/$105/$161/$210 ($99/$149/$229/$299); Grow 1/5/10/15 users $105/$161/$210/$280 ($149/$229/$299/$399); Plus 5/10/15 users $280/$315/$371 ($399/$449/$529). Extra users $29/month each. The page advertised a limited-time discount when fetched. — [Jobber pricing (CA)](https://www.getjobber.com/ca/pricing/)
- Conflicts: older help-centre plan articles say Connect supports up to 5 users and Grow up to 10 — [The Connect Plan](https://help.getjobber.com/hc/en-us/articles/12296620144919-The-Connect-Plan); [The Grow Plan](https://help.getjobber.com/hc/en-us/articles/360050124513-The-Grow-Plan); third-party sources quote other prices (e.g. Plus $699 for 15 users) — [TechRadar review](https://www.techradar.com/pro/software-services/jobber-crm-review). Treat the pricing page as authoritative and prices as volatile.
- Add-ons: AI Receptionist $99/month (included in Plus), Marketing Suite $99/month (included in Plus), Pipeline $49/month (included in Plus). Card processing 2.9% + 30 cents; Tap to Pay 2.7% + 30 cents; ACH 1% (ACH US only). — [Jobber pricing (CA)](https://www.getjobber.com/ca/pricing/); [Jobber product updates](https://www.getjobber.com/product-updates/)

**Feature gating matrix (from individual help articles)**

| Feature | Core | Connect | Grow | Plus | Source |
|---|---|---|---|---|---|
| New Schedule views, drag/drop, unscheduled, map | yes | yes | yes | yes | [New Schedule](https://help.getjobber.com/en/articles/new-schedule/) |
| Online booking | yes | yes | yes | yes | [Online Booking](https://help.getjobber.com/hc/en-us/articles/13808363916951-Online-Booking) |
| User permissions | yes | yes | yes | yes | [User Permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions) |
| Tap to Pay (US/CA) | yes | yes | yes | yes | [Tap to Pay](https://help.getjobber.com/en/articles/tap-to-pay/) |
| Route optimisation | no | yes | yes | yes | [Route Optimization](https://help.getjobber.com/en/articles/route-optimization-new-schedule/) |
| Automated visit reminders | no | yes | yes | yes | [Reminders](https://help.getjobber.com/hc/en-us/articles/360033608974-Assessment-and-Visit-Reminders) |
| Arrival windows | no | yes | yes | yes | [Arrival Windows](https://help.getjobber.com/en/articles/arrival-windows/) |
| Checklists / job forms | no | yes | yes | yes | [Checklists](https://help.getjobber.com/hc/en-us/articles/115009740048-Checklists) |
| Timesheets, approval | no | yes | yes | yes | [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets) |
| GPS waypoints | no | yes | yes | yes | [GPS Waypoint Tracking](https://help.getjobber.com/hc/en-us/articles/115009612507-GPS-Waypoint-Tracking) |
| Expenses (manual) | no | yes | yes | yes | [Expenses](https://help.getjobber.com/en/articles/expenses/) |
| FleetSharp / Force integrations | no | yes | yes | yes | [FleetSharp](https://help.getjobber.com/en/articles/jobber-and-fleetsharp-gps-tracking-integration/) |
| Find a Time (availability + drive time) | no | no | yes | yes | [Schedule Overview](https://help.getjobber.com/en/articles/schedule-overview-new-schedule/) |
| Location timers (geofence) | no | no | yes | yes | [Location Timers](https://help.getjobber.com/hc/en-us/articles/14125014745239-Location-Timers-in-the-Jobber-App) |
| Job costing | no | no | yes | yes | [Job Costing](https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing) |
| Two-way SMS, custom automations | no | no | yes | yes | [The Grow Plan](https://help.getjobber.com/hc/en-us/articles/360050124513-The-Grow-Plan) |
| Crew scheduling | no | no | no | yes | [Crew scheduling](https://help.getjobber.com/en/articles/crew-scheduling/) |
| Crew clock-in, time labels, breaks | no | no | no | yes | [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets) |
| Job profit alerts, receipt auto-fill, Files and Media | no | no | no | yes | [Job Costing](https://help.getjobber.com/hc/en-us/articles/14343244961175-Job-Costing); [Expenses](https://help.getjobber.com/en/articles/expenses/) |
| AI Receptionist | add-on | add-on | add-on | included | [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/) |

- On My Way texts and snow "Create New Visits" are described only as "select plans" / unstated. — [On My Way](https://help.getjobber.com/hc/en-us/articles/7448087796631-On-My-Way-Text-Messages-in-the-Jobber-App); [Snow Removal Workflow](https://help.getjobber.com/hc/en-us/articles/36429203202071-Create-New-Visits-for-Existing-Recurring-Jobs-Snow-Removal-Workflow-New-Schedule)

**Country limits relevant to Calgary**
- Available in Canada: texting/reminders/On My Way, Tap to Pay (no Interac; $250 tap caveat), Jobber Payments, FleetSharp, AI Receptionist, online-booking drive time. — sources as cited in sections 4, 5, 7, 8
- US only: Force Fleet Tracking and its live-tracking links; ACH bank payments; Gusto payroll is a US payroll product. — [Jobber and Force Fleet Tracking](https://help.getjobber.com/en/articles/jobber-and-force-fleet-tracking/); [Jobber product updates](https://www.getjobber.com/product-updates/)

**Release timeline (2025-2026)**
- 2025: New Schedule opt-in preview from May, opt-out default for select accounts from July; FleetSharp new version (July 2025); Force live-tracking links default-on from 25 Aug 2025; AI Receptionist launched (press coverage 2025); new accounts New-Schedule-only from 12 Nov 2025; Receptionist gained ability to assist existing clients with upcoming visits (12 Dec 2025, snippet). — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/); [FleetSharp](https://help.getjobber.com/en/articles/jobber-and-fleetsharp-gps-tracking-integration/); [Force](https://help.getjobber.com/en/articles/jobber-and-force-fleet-tracking/); [Route Optimization Through the Settings Menu](https://help.getjobber.com/hc/en-us/articles/115009785148-Route-Optimization-Through-the-Settings-Menu); [Product update: Receptionist](https://productupdates.getjobber.com/121638-receptionist-now-does-more-to-assist-your-existing-clients) (snippet)
- Jan 2026 roundup: New Schedule nested/stacked and greyed/strikethrough settings; offline support (forms, visit details, notes, time tracking) by end of Jan 2026; multi-photo capture; image markup; Tap to Pay tips; Receptionist website chat; two-way texting with images; multi-step request forms. — [Jobber product updates](https://www.getjobber.com/product-updates/)
- 13 Mar 2026: "New Schedule: Better visibility and control over your calendar" (snippet only). — [Product Updates feed](https://productupdates.getjobber.com/?page=2)
- 5 Jun 2026: timesheet entry edit history begins. — [Timesheets](https://help.getjobber.com/hc/en-us/articles/115009543028-Timesheets)
- 8 Sep 2026: Crew scheduling help article published (updated 6 Nov 2026). — [Crew scheduling](https://help.getjobber.com/en/articles/crew-scheduling/)
- 23 Sep 2026: Jobber Teammate AI agent beta early access (morning briefings, task triage, learns preferences), per a third-party summary. — [BriefGlance](https://briefglance.com/companies/octopusapp-inc-jobber/pulses/87587) (secondary source)
- Legacy Schedule sunset date: "still to be determined" per the help article. — [New Schedule](https://help.getjobber.com/en/articles/new-schedule/)

**AI scheduling**
- AI Receptionist books jobs into the calendar using online-booking settings (eligible team members and services), reschedules and cancels, or creates follow-up tasks; can require approval before acting. — [Receptionist](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/)
- Jobber Copilot: AI assistant positioned as business coach / data analyst / product expert; non-admins in the app get product support only. A help note mentions a Jobber AI Voice and Chat beta including hands-free schedule queries. — [Lawn and Landscape: Jobber Copilot](https://www.lawnandlandscape.com/news/jobber-copilot-artificial-intelligence-ai); [Jobber App Basics](https://help.getjobber.com/hc/en-us/articles/7061327071639-Jobber-App-Basics)
- Jobber marketing describes scheduling as suggesting times across crews by availability and drive time and building optimised routes. — [Jobber llm-info](https://www.getjobber.com/llm-info/) (search snippet)

### Inferences
- "AI scheduling" in Jobber as of late 2026 is: rule-based slot suggestion (Find a Time), on-demand route sequencing, and an LLM front-end (Receptionist) that books through the same online-booking rules. No evidence of autonomous dispatch, auto-rebalancing between crews, or weather-triggered scheduling.
- For a 2-4 person Calgary crew wanting route optimisation + reminders + timesheets, the realistic Jobber tier is Connect (5 users); wanting geofence timers or job costing forces Grow; wanting crews forces Plus. Price-to-feature gating is itself a competitive opening for a small-crew product.

### Gaps
- productupdates.getjobber.com could not be read directly (403), so the 2026 release list is incomplete and several dates rest on search snippets.
- Whether Jobber Teammate performs any scheduling/dispatch actions is unconfirmed.
- No CAD price list was found; the /ca/ pricing page displayed USD.
- Reddit (r/Jobber, r/lawncare) sentiment was not retrievable in this pass; complaint evidence is limited to forum/review snippets noted in sections 2 and 3.
