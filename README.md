# Plotline

Plotline (formerly the working name "AI Social Growth OS"): plan, create, approve, publish and grow social media from one workspace.
Built from `AI-Social-Growth-OS-PRD-v1.0.pdf`. Requirement IDs in code comments (for example `SH-07`) point to that PRD.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No database setup is needed: local development uses PGlite, a real Postgres that runs
inside Node and stores its data in `.data/`. It migrates and loads demo data (KnockKnockClub, Cafe, Real estate) on
first start.

### Signing in

Sign-in uses **Clerk** (email codes, Google). With no keys set, Clerk's keyless mode creates temporary development keys
on first load, so sign-up works straight away; use "Claim application" in the Clerk banner to attach them to your Clerk
account, then set your Google and email options in the Clerk dashboard. For staging and production, put the keys from the
Clerk dashboard in `.env.local` (see `.env.example`).

After signing up you go through onboarding (PRD 6.1): how you work (agency or brand), your workspace (name, country,
timezone, currency) and your first space (name, colour, status template). It creates your organisation with you as Owner
and starts a 14-day trial. In development, onboarding also offers "Explore KnockKnockClub", which adds you to the seeded
demo agency as an Admin.

Clerk only handles identity. Organisations, spaces, roles and permissions stay in our database
(`src/server/tenancy.ts`), so row-level security and the role checks are unchanged. On first sign-in, a user is matched by
Clerk id, then by verified email (for seeded or invited users), or created (`src/db/accounts.ts`).

To try every role without Clerk, run `npm run dev:roles` (or set `AUTH_MODE=dev`) and pick a seeded user from the
account menu:

| User  | Role    | Spaces            |
| ----- | ------- | ----------------- |
| Prem  | Owner   | All               |
| Rahul | Manager | Cafe, Real estate |
| Riya  | Editor  | Cafe              |
| Neha  | None    | Goes to onboarding |

## Scripts

| Command               | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `npm run dev`         | Start the app                                                        |
| `npm test`            | Permission matrix and tenant-isolation tests                         |
| `npm run typecheck`   | Generate route types and run TypeScript                              |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts`                 |
| `npm run db:migrate`  | Apply migrations to the hosted Postgres in `DATABASE_URL`            |
| `npm run db:reset`    | Delete the local database (stop the dev server first); it reseeds on next start |
| `npm run worker`      | Run background jobs as their own process (production, needs `DATABASE_URL`) |

## How it is put together

- **Next.js 16** App Router, React 19, Tailwind CSS 4. Server Components read data; Server Actions change it.
- **Postgres + Drizzle ORM.** `src/db/schema.ts` holds the PRD section 8 entities. Set `DATABASE_URL` to use a hosted
  Postgres (Supabase or Neon in Mumbai) instead of PGlite.
- **Tenant isolation in the database.** Every tenant table has a row-level security policy
  (`drizzle/0001_rls.sql`). Application queries run through `withOrg()`, which switches to the restricted `app_user`
  role for the transaction, so Postgres itself refuses cross-organisation reads and writes. `src/db/rls.test.ts` fails if a
  new table with `org_id` is not protected.
- **Permissions** (`src/lib/permissions.ts`) follow PRD section 4 and are checked in every Server Action.
- **Development sign-in** (`src/server/session.ts`) is a cookie that picks a seeded user. It refuses to run in production
  unless `AUTH_MODE=dev`. It is replaced by the hosted auth provider before real customer data.

```
src/
  app/o/[org]/            organisation shell, overview
  app/o/[org]/s/[space]/  space views (board, table, ...) and their Server Actions
  app/review/[token]/     public client review page (no login)
  components/             shell, board, content panel, UI primitives
  db/                     schema, connection, seed, RLS test
  jobs/                   Postgres job queue, worker, Instagram and Facebook import and sync
  lib/                    permissions, formatting, placements, content versioning, Meta Graph client, crypto
  server/                 session, tenancy, queries, activity log
drizzle/                  SQL migrations
```

## What works today

### First audit (`/o/[org]/s/[space]/audit`, PRD OB-07, OB-08)

- Reads the last 90 days of imported posts, metrics and daily follower snapshots (`posts`, `post_metrics`,
  `account_metrics_daily`).
- `src/lib/analytics/audit.ts` computes every number: reach share by format, engagement rate by pillar and time of day,
  posting consistency, the best post. Groups under 5 posts are never compared. The AI Copilot will reword these findings
  later but never changes the numbers (AI-07).
- Three recommendations with their evidence; "Add to plan" saves them to `insights`.
- A draft two-week calendar on the best days and time. "Add drafts to calendar" creates real posts in "Idea", with Undo,
  and never adds the same draft twice.
- Until Instagram and Facebook import exists, the Cafe space gets 90 days of sample history (`src/db/demo-history.ts`) and
  the page labels it as sample data.

### Analytics (`/o/[org]/s/[space]/analytics`, PRD AN-01 to AN-10)

- Platform filter, 7/30/90-day ranges and "vs previous period", all kept in the URL so any view can be shared.
  Comparison only shows when history reaches back far enough; otherwise the page says why.
- Six overview cards with their PRD definitions, "what happened, why, what next" with source labels and sample sizes,
  platform cards that filter the page, engagement rate by platform, contribution by platform, follower growth from daily
  snapshots, breakdowns by format and pillar, a day-and-time heatmap, top and lowest posts, and a sortable table of every post.
- `src/lib/analytics/report.ts` computes everything (tested in `report.test.ts`). Charts are plain SVG and HTML with
  colour-blind-checked platform colours and hover tooltips.
- Refresh is limited to once every 15 minutes per space. Paid ads (V2) shows its empty state.
- Contribution by platform is a single share bar instead of the PRD's pie/bar toggle: a pie of two or three slices is hard
  to compare.
- Layout after the reference boards: Organic and Paid ads as underline tabs; a platform menu (logos, not-connected
  ones greyed) with "N of 3 platforms active"; Insights (opens the AI Copilot with a question about this space's
  numbers), Reports (download the period's posts as CSV, or print or save the page as PDF) and the date range as a
  button showing the period. "Cross-platform overview" KPI cards have an icon and a one-line description;
  Engagement rate by platform is a vertical bar chart on a % axis; Contribution has a metric menu and Donut or Bars;
  Top content shows cards with the platform, format, rank, caption, views, likes, comments, engagement rate and
  View post (the platform's link). Paid ads shows a Meta Ads row to connect (V2).

### Invites and members (`/o/[org]/settings/members`, PRD 6.19, flow F5)

- Invite several emails at once with a role (Admin, Manager, Editor) and spaces. Owners and Admins invite anyone;
  Managers invite Managers and Editors to their own spaces.
- Invite emails go through Resend (`RESEND_API_KEY`). Without a key the invite is still created and you get the link to
  copy or share on WhatsApp. Links work for 7 days; only a hash of each link is stored.
- Pending and expired invites with Resend (new link) and Revoke. Members with role, spaces and last active; Owners and
  Admins change access or remove people, which unassigns their open posts and tasks.
- `/invite/[token]`: sign up or sign in, then join. The signed-in email must match the invite (and be verified in
  Clerk). People who sign up without the link see their invites at the top of onboarding.

### Media library (`/o/[org]/s/[space]/media`, PRD 6.12, CT-02)

- Upload images, videos and PDFs (button or drag and drop) with progress. Files stream to storage through
  `/api/o/[org]/s/[space]/media`; images get a thumbnail and dimensions (sharp), videos get size, length and a poster frame
  read in the browser. Each file is checked against its type (images are decoded; videos and PDFs by signature), so a renamed
  file is rejected. SVG is not accepted.
- Folders: Brand assets and one per project are created automatically; add your own. Search by name or tag, filter by type and
  source, edit tags and folder, see where each file is used, download, and delete (with a warning listing the posts that use it).
  Storage meter against a 5 GB limit until billing sets plan limits.
- In the content panel: attach from the library or upload straight into the post, reorder (the first image is the cover), remove.
  Media is part of what a client approves: changing it clears an approval (SH-07). Board cards and the review page show the media;
  clients can swipe through and download.
- Files are served only through permission-checked routes; the review page can only fetch media attached to posts in its link.
- Storage is local disk (`.data/uploads`) in development, behind `src/storage/index.ts`. Production needs the S3-compatible
  driver (Cloudflare R2 or S3) added there.

### Public website (`/`)

- Signed-out visitors get the marketing site; signed-in people still go straight to their workspace.
- Look: a light orange gradient hero with dark text, a floating dark pill navigation, headlines in bold Inter with an italic Instrument
  Serif second line, translucent product frames, soft grey cards and black pill buttons (the style the owner chose,
  rebuilt with Plotline's own content).
- Sections: hero with an animated product scene (a cursor opens a post from the board, the client approves it, a toast
  drops in); "Built for the days that make or break a month" with five use-case pills that play a scene each (Diwali
  week, client approval, Hinglish caption, failed post, monthly results); four numbered steps; a chip cloud of
  features; the AI Copilot; "Each client, kept apart" (roles and security); Made for India; a glass pricing card; FAQ;
  a closing card and the footer.
- Pricing reads `src/lib/billing/plans.ts` (plan, monthly or yearly, rupees or dollars), so the site and Billing always
  agree; while prices are drafts it says they're provisional.
- Motion: headline words slide up in turn, sections fade and lift in, the feature chips arrive in a wave, step
  illustrations play when they come into view (accounts connect, the calendar fills, the Approve button pulses, the
  results line draws), drifting light in the hero and closing card, two marquees of formats and festivals, client
  spaces orbiting a shield, a pointer-following light on cards, a scroll progress bar and the hero app tilting flat as
  you scroll (scroll-linked parts only where the browser supports them).
- Smooth scrolling: only `transform` and `opacity` animate, with no `filter` or `backdrop-filter` blur anywhere; one
  `MotionLayer` component owns the observers and the pointer listener; animations pause offscreen (`data-live`) and
  the use cases only advance while visible. CSS only, no extra libraries; everything shows without JavaScript and
  motion stops for people who ask for reduced motion.
- Copy describes only what the product does today; illustrations are labelled as samples; no customer logos,
  testimonials or usage numbers.
- Published on its own to Cloudflare Workers as static files: `site/` is a tiny Next.js app (`output: "export"`) that
  renders the same components, and `wrangler.jsonc` builds it (`npm run build:site`) and uploads `site/out`. Pushing to
  main deploys it through Workers Builds (Worker `growthosprem`; deploy command `npx wrangler deploy`). Sign in and
  Start free lead to an "opening soon" page (`/start`) until `PLOTLINE_APP_URL` is set in the Cloudflare build variables.
  Try it locally with `npx wrangler dev`.
- The app itself can't run on Workers as it is (sharp, PGlite on disk, media on disk, the always-on job worker); it
  needs a Node host or a port to Hyperdrive, R2, Cloudflare Images and Cron Triggers. Postgres will be Neon
  (Singapore).

### AI tagging of posts (PRD 9, AN-07)

- Imported and published posts are tagged with a pillar, a topic and a hook type (Question, Bold claim, Number or list,
  How-to, Story, Behind the scenes, Offer, Trend, Testimonial, Announcement). Format comes from the platform.
- The worker looks for untagged posts every minute and tags them 25 at a time per space with the writing model (Sonnet
  5.5, structured output), reusing the space's existing pillars. Only blanks are filled: a pillar that came from the
  post's content item is kept. Usage is metered as "Post tagging"; it pauses when the AI budget is used up or the
  organisation is read-only, and only runs when AI is set up.
- Analytics breakdowns add Topic (the 8 most posted about) and Hook next to Format and Pillar, and say how many posts are
  tagged. Each post in "All posts in this period" shows its tags; "Edit tags" corrects them, and hand-set tags are never
  overwritten. AI Copilot's analytics tool sees the topic and hook breakdowns too.
- AI settings › Post tagging shows tagged and waiting posts per space, with "Re-tag topics and hooks".
- Not yet tested against the real API (no ANTHROPIC_API_KEY here); covered by tests with a stand-in model.

### Billing (Settings › Billing, PRD 6.20, OB-10, UI2-01, TM-04, MD-05), sample mode

- Priced per active space with seats included (the PRD's working assumption). Plans, prices, seats, AI credits and storage
  per space live in `src/lib/billing/plans.ts`. **The prices there are drafts** (Starter ₹999, Growth ₹2,499, Agency
  ₹4,999 per space a month; $15, $35, $69 outside India; extra seats ₹299 or $5; yearly is 10 months).
- 14-day trial with Growth's limits; the top-bar badge counts down and opens Billing (it shows the plan once chosen).
  When the trial or a plan ends, Plotline turns read-only for everyone (viewing works; creating, editing, publishing
  actions, uploads and invites are refused) with a banner, until the Owner chooses a plan.
- Billing page (Owner; Admins can look): status, seats and storage meters, plan picker with monthly or yearly, a checkout
  that shows the invoice before paying, extra seats, the next invoice, billing details (legal name, GSTIN, email,
  address, state) and invoices. Plan changes apply limits at once and the price from the next renewal; cancel keeps the
  plan until the period ends.
- GST invoices in India: CGST and SGST when the buyer is in the seller's state, IGST otherwise (state from the GSTIN or
  the chosen state; IGST when unknown). Numbered `PLT-YYYY-0001`, printable to PDF.
- Seats (TM-04): members plus pending invites; invites over the limit are refused with an upgrade prompt. Storage
  (MD-05) and the monthly AI budget follow the plan and the number of active spaces.
- Sample mode: no payment is taken and no card or UPI details are collected; the worker renews sample plans at the end
  of each period. Not yet: Razorpay and Stripe checkout, webhooks and real payment methods (they need your accounts and
  test keys), proration, seller GSTIN and SAC code (set them with your accountant).

### Spaces (Settings › Spaces, space settings › Space and Members, PRD 6.3, SP-01 to SP-06)

- "Create your new social space" (Owner and Admins, from the sidebar's "Create social space" or Settings › Spaces): avatar initial and
  colour, name, time zone, members (existing Managers and Editors; Owners and Admins are in every space), and statuses
  from a template or copied from another space. The footer shows "N members, N statuses"; "Create and open" or "Create
  only".
- Space tab (SP-03): name, avatar colour, time zone, a colour per platform used on the space's calendar (and its posts on
  the organisation calendar), and platforms hidden from the "Add platform" picker.
- Members tab: everyone who works in the space; Managers (in their spaces), Admins and the Owner add existing members or
  take them out, which unassigns their open tasks and posts there.
- Archive (SP-05): hidden from the sidebar ("Show archived spaces" reveals them), read-only for everyone (actions refuse
  changes; editing controls disappear; share links stop working), and its scheduled posts are unscheduled so nothing
  goes out. Restore from the banner or Settings › Spaces.
- Delete (SP-06): from Archived, after typing the name exactly. The space disappears at once; the Owner can restore it
  for 30 days from "Recently deleted", then the worker removes it and its media for good.
- Not yet: uploading a logo as the avatar, custom planning-only platforms (a WhatsApp channel, a blog), duplicating a
  space (SP-07, V2).

### Projects, statuses and the Create menu (PRD 6.4, 6.5, UI2-02 to UI2-04, ST-01 to ST-06, PJ-01 to PJ-05)

- Projects (Space settings › Projects): "Create your new project" with name, goal, dates, colour and "Create a media
  folder for this project" (on by default), then "Create and open" or "Create only". Settings (rename and fields; the
  folder follows the name), Duplicate (settings only, not content), Archive and Restore ("Show archived projects"), and
  Delete: tick whether to also delete its posts, tasks, notes and media (all off; the rest stays in the space without a
  project), with a warning when its files are used elsewhere, enabled only after typing the name exactly.
- Project views (`/o/[org]/s/[space]/p/[project]/board`, table, calendar, previews, notes) are the space's views
  filtered to the project; anything created there joins it. The header shows "Space › Project", the sidebar lists open
  projects under the space and highlights the current one (UI-08), and search opens projects there.
- Statuses (Space settings › Statuses, also from the tab bar and "Manage statuses" in the post panel): content and task
  sets side by side, grouped by category. Add, rename, recolour, change category, reorder within a category, map the
  client review steps (each to one status) and choose which can autopost. Every category keeps at least one status;
  deleting one in use asks where its posts or tasks go; import replaces a set from a template or another space, moving
  work to the same name or else the same category.
- Create menu (tab bar): Content, Task, Note, or Generate with AI; in a project they're created in it.
- Not yet: the Space and Members settings tabs, a searchable status picker (the native one is grouped by category).

### Tasks (Board and Table "Tasks" toggle, task panel, PRD 6.8, TK-01 to TK-04, ST-03)

- A task belongs to a post, a project or the space, with title, status, assignee, due date, priority (Low, Medium, High,
  Urgent), description, checklist and team-only comments (clients never see tasks, SH-05). Tasks have their own
  statuses per space (To do, Doing, Done, Won’t do); "done" follows the status, so ticking a box moves it to Done.
- Task panel (`?task=id`) over any Board, Table or Calendar view, and over the post panel when opened from it; Esc closes
  the task first.
- Board and Table get a Content | Tasks toggle (VW-01, VW-03). The task board drags between statuses and adds a task per
  column; the task table edits status, assignee, due date and priority inline, with search, filters (assignee, status,
  overdue, next 7 days) and sort. The Calendar shows tasks by due date and opens them in the task panel.
- Post panel: tick tasks off, add one, or add a format's steps (TK-04: Reel = Script, Shoot, Edit, Thumbnail, Client
  approval, Publish; also Carousel, Post and Story) with due dates counted back from the publish date and an optional
  assignee. Steps already on the post are skipped.
- Overview: Assigned to me, Overdue tasks, Tasks by status and Open tasks by person (OV-03).
- Notifications (TK-03): assigned, comments and @mentions on tasks, due in the next day, overdue.
- Not yet: task templates you can edit per space, recurring tasks, unassigning a removed member's tasks.

### Overview dashboard (`/o/[org]/overview`, PRD 6.2, OV-01 to OV-03)

- "{Organisation} overview" with cards each person arranges (`src/components/overview/Dashboard.tsx`, data from
  `src/server/overview.ts`): Setup checklist (until done), Recent activity (posts and notes), Content by space,
  Content by status, Upcoming items (posts and tasks), Tasks by status, Tasks by assignee, Assigned to me (posts and
  tasks), Overdue (posts past their date that aren't completed or closed, and overdue tasks), Waiting for client
  approval, Publishing overview and Space breakdown. Items show as cards with the space, date, status, people and
  platform logos.
- Drag a card by its title to move it; its "···" menu makes it wider or narrower, moves it to the top or hides it;
  Cards chooses which show; Reset goes back to the default. Saved per person (`users.preferences.overview`).
- Filters (spaces) and a date range (7, 14 or 30 days, for Upcoming and Recent) live in the URL; + Create makes a post,
  task or note in a chosen space.

### Notifications (`/o/[org]/notifications`, PRD 6.18, NT-01 to NT-04, TK-03, UI-02)

- Notifications page (NT-01): Primary and Cleared tabs, search, filters by type and by space, unread only, mark as read
  or unread, clear (with Undo) and clear all, restore from Cleared, grouped by day. "You're all caught up" when empty.
  With filters on, the bulk buttons act on what's shown. The sidebar shows Notifications with the unread count; the
  bell keeps the latest 12 and links to the page.
- Types (NT-02): Action required (a post failed, time to post by hand, an account needs reconnecting), Comments and
  mentions (team comments on your posts, `@Name` in a comment, note mentions), Content updates (assigned to a post, its
  status changed), Task updates (due in the next day, overdue; TK-03), Client review (approved, changes asked), Publishing,
  Social account (access about to expire), AI Copilot (80% and 100% of the monthly budget), System.
- Preferences (NT-03, `/o/[org]/notifications/settings`): in-app and email per type, as defaults and per space, with
  "Use default" and "Apply to other spaces". Action required always shows in-app. Failed posts email only if still
  failed 30 minutes later (PB-10).
- Email: the worker sends queued emails every minute through Resend; without `RESEND_API_KEY` they are marked skipped.
  Optional daily digest (NT-04) at 9 AM in the person's time zone, only on days with something unread.
- Browser notifications (NT-03): "Turn on for this browser" in notification settings registers a service worker
  (`public/sw.js`) and a push subscription; a Browser column picks the types. The worker sends them with Web Push and drops
  subscriptions the browser has given up. Production needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
  (`npx web-push generate-vapid-keys`); development generates a pair into `.data/vapid.json`.
- Not yet: WhatsApp and Slack (NT-05, V2), workflow notifications (V2).
- Filters: a popover with type chips (several at once, each with how many there are) and space chips, kept in the
  URL. Summarize opens the AI Copilot with "Summarize my recent notifications…" filled in; the Copilot reads them with
  its `list_notifications` tool. The Cleared tab has Delete all, which removes cleared notifications for good.

### App frame and navigation

- Layout modelled on the owner's reference boards, in Plotline's own colours: a full-height sidebar with the
  organisation at the top, and a dark top bar over the main column only (sidebar toggle, logo, search, notification
  bell, trial or plan badge, your avatar). On wide screens the toggle hides the sidebar and a cookie remembers it; on
  phones the sidebar is a drawer.
- Sidebar: the gear opens Members, Spaces and Billing (Owners and Admins) and your notification settings; Overview,
  Notifications (unread count) and AI Copilot; "Social spaces" with an explanation, a "···" menu with a Show archived
  spaces switch, and a Search spaces box that also finds projects. Each space opens and closes with its chevron (the
  one you're in opens by itself) and has a "···" menu (Board, Calendar, Analytics, Space settings, Members). Inside:
  First audit, Analytics and a Projects group with its count, "Create project" (opens the dialog in Space settings ›
  Projects) and the open projects. At the bottom: Create social space, Invite members, Product updates and Community.
- Product updates (`src/lib/changelog.ts`): the latest changes in a popover with New, Improved and Fixed tags, a
  "New" badge until you open it (remembered in this browser), and the full list at `/o/[org]/updates`.
- Community: links to a community group and an affiliate programme only when `NEXT_PUBLIC_COMMUNITY_URL` and
  `NEXT_PUBLIC_AFFILIATE_URL` are set, and Install app (a web app manifest at `src/app/manifest.ts` with icons in
  `public/icons`); browsers that don't offer installing get a short how-to instead.
- Short messages in the corner (`toast()` from `src/components/Toaster.tsx`), for example when a Board move fails.
- Support Center (sidebar): a help window on the page with search over the help articles (`src/lib/help.ts`, also at
  `/o/[org]/help`), bookmarks (Product updates, all articles, keyboard shortcuts) and Submit a ticket by topic. Tickets
  are sent to `/api/o/[org]/support` with up to three images, videos or PDFs (10 MB each, kept in storage under
  `support/`), saved in `support_tickets` and emailed to `SUPPORT_EMAIL` with the files attached and the person as
  reply-to when that and Resend are set up; the window says plainly when email isn't set up.

### Settings window

- The sidebar gear opens settings as one window over the app (`src/components/settings/SettingsFrame.tsx`); every page
  keeps its own URL, Esc or × returns to the page you came from, and phones get the sections as a menu. Left: Profile
  (Profile, Notifications), Organisation (General, Members, Spaces, Tags, Branding, Billing, AI usage; Spaces,
  Branding, Billing and AI usage for Owners and Admins) and each social space with a search box.
- Profile: display name, calendar preferences (first day of the week, colour by platform or status, with a preview),
  and with Clerk "Manage account" (email, password, two-step verification, delete account) and Log out.
- General: rename the organisation (Owners and Admins, new `org.settings` permission); region shown read-only.
- Members: "Invite new member" opens an invite window (several emails, a role picker that says what each role can do,
  spaces chosen from a searchable list with Select all; links to copy or share on WhatsApp afterwards). Expired invites
  show in red. A space's Members tab has the same button with that space filled in.
- Tags (`org_tags`): add, rename and delete the organisation's tags; renaming or deleting changes every post that has
  the tag. Tags already on posts are listed too, with how many posts use each, and the Table suggests the list.
- Branding: a logo (resized to 256 px in the browser), primary and secondary colours, and "Brand client-facing pages",
  which client review and strategy links follow (`src/components/BrandMark.tsx`).
- Space settings (Space, Accounts, Autopost, Projects, Members, Statuses, Brand Brain) open in the same window.
- Old addresses (`/notifications/settings`, `/ai/settings`) redirect to the new ones.
- Autopost › Platform defaults (`spaces.post_defaults`): an Instagram first comment for new posts (Plotline posts it
  after publishing, not on Stories) and whether new Reels are shared to the main feed. Facebook and LinkedIn have none,
  since Plotline doesn't send titles or visibility to them.
- Integrations (Profile › Integrations): a private calendar feed (`/api/calendar/<token>.ics`, iCalendar) with the
  posts planned, and optionally the tasks due, in every space the person can see, for Google Calendar, Outlook or Apple
  Calendar. Only the token's hash is stored (`calendar_feeds`); the link is shown once, "Make a new link" replaces it
  and access is checked on every fetch. Google Drive, Canva and AI-assistant connections are listed as not available
  yet; social accounts are managed in each space.
- Not yet: Google Drive and Canva (they need OAuth apps), workflow usage (no workflows yet).

### Search palette (top bar, Ctrl/⌘ K or Ctrl/⌘ /, PRD SR-01 to SR-03)

- Searches content titles, captions and hashtags, tasks, projects, spaces, notes and Idea Bank ideas across every space
  you can see, grouped by type, with the match highlighted, a snippet when it matched in the text, the space, platform
  logos and how long ago. An empty search lists recent posts and your spaces.
- Arrow keys move, Enter opens (posts open in their panel, projects open the Table filtered to them, notes and ideas
  open on their own), Esc closes. Results come back in about 30–60 ms on the sample data.
- Not yet: search inside media by AI description (SR-04, V2); a trigram index for large workspaces.

### Inbox (beta, `/o/[org]/s/[space]/inbox`)

- Comments on the space's Instagram and Facebook posts from the last two weeks come in with each account sync
  (`src/inbox/core.ts`, Graph `listComments`), one thread per comment with its replies; the account's own replies show
  as outgoing and are never threads of their own. New comments in a thread mark it unread and reopen it if it was done.
- Reply publicly from Plotline (Graph `replyToComment`: Instagram `/{comment}/replies`, Facebook `/{comment}/comments`);
  people who can publish in the space can reply. Mark done and reopen; filter by All, Messages and Comments, Open or
  Done, and search. The Inbox tab sits on the space (not projects) with a Beta label.
- Direct messages are not connected: they need Meta's messaging permissions, which the Meta app doesn't have yet, and
  the Messages filter says so.
- Sample mode (development): "Add sample conversations" puts sample comments on recent posts; replies to them stay in
  Plotline and say so.

### Post window (content panel, PRD CT-12, SH-02, ST-01)

- Header in a warm tint with the space and project, "Repurposed group" when it has one, and Share, Repurpose, the
  "···" menu (Duplicate, Archive, Delete with a confirmation) and Schedule or post.
- Fields with icons: Status (a searchable picker grouped by category, with Manage statuses), Assignees (search and
  tick people in the space), Project, Tags (type and press Enter; the organisation's tags and tags in use are
  suggested), Schedule and Pillar. Changes save straight away; a failed save puts the old value back and says why.
- Repurpose (`src/server/content-ops.ts`): a post with several platforms becomes one post per platform, linked as a
  group (`content_items.group_id`) that the window lists at the top, so each can have its own caption, media and date.
  Each keeps the status, assignees, tags, media and date; a platform's own caption becomes that post's caption.
  Scheduled or published posts can't be split.
- Share: a link for this post, or any posts in its group, that anyone can open without an account: Can view, Can
  comment or Can approve, expiring in 1, 7, 14 or 30 days or never. Copy it, email it or send it on WhatsApp; links
  already shared are listed with Copy and Turn off.
- Duplicate makes a draft copy (text, tags, project, assignees, media and platforms, without dates or results) and
  opens it.

### Per-platform captions (content panel, PRD CT-06)

- One shared caption by default, with a counter per chosen platform. "Customise per platform" splits it into a tab per
  platform, each with its own counter and limit; AI caption help works on the tab you're on. "Use one caption" goes
  back, keeping the caption you choose. Platforms added later start from their platform's caption.
- Previews, the client review page, publishing and "Copy caption" (one per platform) use each platform's caption.

### Strategy (`/o/[org]/s/[space]/strategy`, PRD 6.16, SG-01 to SG-04)

- Wizard (SG-01): business, industry, audience, location, offer, objective, platforms, posts a week, competitors and
  festival regions, prefilled from Brand Brain, connected accounts and posting history.
- Strategy document (SG-02): positioning, audience, goals with metrics and targets, content pillars with target shares,
  formats and frequency per platform, themes, growth tactics (reach, engagement, community, conversion) and a
  30/60/90-day plan. "Build from my data" works without AI: pillars that already work keep their place, weighted by
  engagement; goals start from the real follower count and engagement rate; cadence leans on the formats that reach
  most. "Write it with AI" (Opus 5.5) starts from that and sharpens it. Every save is a version you can view and
  restore; editing works section by section. "Share with client" gives a read-only link (only a hash is stored; a new
  link replaces the old one, and it can be turned off).
- Plan 30 days (SG-03): a table of date, time, format, pillar, topic, hook and CTA, spread by the strategy's cadence and
  pillar shares at the best posting time, with topics from the Idea Bank where a pillar matches and festivals taking over
  the nearest post. "Plan with AI" writes the topics, hooks and CTAs. Edit, untick, then "Add to calendar" creates drafts
  in Not started (ideas used are marked as turned into posts); the rest of the plan stays.
- Festivals and moments (SG-04): India-first calendar for 2026 and 2027 (lunar festivals and Eid marked approximate; 2026
  dates follow the Government of India holiday lists), regional festivals by the strategy's regions, global days, plus the
  space's own dates. "Add as campaign idea" sends one to the Idea Bank. They also show as markers on the Calendar.
- Not yet: monthly review against the plan (SG-05, V2), a Copilot "Create strategy" card, festival dates beyond 2027.

### Idea Bank (`/o/[org]/s/[space]/ideas`, PRD VW-07, AI-05)

- Ideas with title, notes, source (Me, AI, Trend, Competitor), pillar, tags, reference links (http/https only) and
  reference images from the media library or uploaded on the spot. Quick add from one box; full details in a dialog.
- Cards with search and filters (source, pillar, tag, include ideas already used), or "By pillar" columns where you
  drag an idea to change its pillar.
- "Sort into pillars with AI" suggests a pillar for every idea without one, reusing the space's existing pillars (from
  ideas, posts and imported history). Suggestions are editable and only applied when you approve; usage is metered.
- "Turn into content" creates a draft in the first Not started status with the idea's notes and links as the caption,
  its pillar, tags and images, and links back ("Became a post").
- AI Copilot can propose ideas as an "Add to Idea Bank" card (AI-05); approving saves them as AI, Trend or Competitor
  ideas, and Undo removes the ones not yet turned into posts. A new built-in prompt brainstorms ideas.
- Not yet: trend and competitor feeds that suggest ideas automatically (6.17), voice-memo ideas, sharing ideas with clients.

### Notes (`/o/[org]/s/[space]/notes`, PRD VW-06)

- Rich-text notes per space for briefs and meeting notes, optionally tied to a project; pin, search, filter by project,
  delete with confirmation. Templates: Campaign brief, Meeting notes, Monthly check-in.
- Editor (Tiptap): headings, lists, checklists, quotes, links, undo. "/" opens the block menu; "@" mentions someone in
  the space (they get a notification, once per mention); "[[" links a post, which opens its panel; ":" inserts emoji.
- Autosave after a short pause with "Saved" / "Couldn't save · Retry", and a warning before closing the tab with unsaved
  changes. Later save wins (as CT-13).
- Documents are sanitised on the server: only known blocks and marks, safe link targets (no `javascript:`), a size limit,
  and mentions only of people in the space.
- Not yet: real-time co-editing (CT-15, V2), notes in the search palette (SR-02), attaching files, comments on notes.
- Each note has a "···" menu: Duplicate, Copy link, Print or save as PDF (a page on its own at
  `/print/[org]/[space]/note/[id]` that opens the print dialog) and Delete. Team comments sit under the note (never
  shown to clients); @name notifies that person, and the note's author and others in the thread get a comment
  notification (`note_comments`).

### Table (`/o/[org]/s/[space]/table`, PRD VW-02, VW-03)

- One row per post with cover, title, status, platforms, schedule (space time), assignees, project, tags, pillar and
  publishing. "Columns" shows or hides each one.
- Inline editing: title, status, schedule (date picker, Clear to remove the date or unschedule), assignees, project,
  tags (with suggestions) and pillar. Rescheduling a post that's scheduled to publish goes through the readiness check,
  like the calendar; problems show with their fixes. Edits after client approval send the post back to review (SH-07).
- Search plus filters for assignee, platform, tag, project, status, date (upcoming, next 7 or 30 days, past, no date),
  publishing state and archived posts; sort by last updated, schedule date, created date or title. Columns, filters
  and sort are saved per person for each space.
- Multi-select (shift-click for a range) with a bulk bar: change status, assign, move to project, reschedule by a
  number of days, add a tag, archive or restore, and delete (with confirmation). Each post succeeds or fails on its own,
  and the failures stay selected with their reasons.
- Archived posts leave the Board, Calendar, Previews, Overview and the Copilot's view, and can be restored from the
  Table. Posts scheduled to publish must be unscheduled before archiving or deleting.
- Not yet: column reordering and resizing, an organisation-wide table, CSV export.
- Each row has a "···" menu: Open, Copy link, Duplicate, Archive or Restore, and Delete (asks again).

### Previews (`/o/[org]/s/[space]/previews`, content panel, review page, PRD VW-05, CT-03, SH-03)

- Platform-accurate previews (`src/components/preview/PostPreview.tsx`) for Instagram Post, Carousel, Reel and Story,
  Facebook Post, Reel and Story, and LinkedIn Post: each app's own header, buttons and fonts, its caption cut-off
  ("… more" / "See more" / "…see more" at the same length), highlighted hashtags, mentions and links (Hindi too), the
  first comment, carousels you can swipe, Facebook's 1–4+ image grids, and the crop each platform applies (Instagram
  feed 4:5 to 1.91:1 using the first item's shape; Reels and Stories 9:16).
- "Safe zones" on Reels and Stories shade the parts the app's buttons and caption cover.
- Each preview lists the media and caption rules the platform would reject (from the readiness check); Stories remind
  that captions don't show.
- Content panel: Media and Preview tabs on the left, switchable between the post's placements (CT-03). "Fix media"
  buttons switch back to Media.
- Previews view (VW-05): every post as it will look, filtered by placement and by Upcoming, Next 30 days, Unscheduled or
  All; click a title to open the post.
- Client review page (SH-03): clients see the same previews (without internal warnings), with downloads below.
- Not yet: an Instagram profile-grid preview (imported posts have no images to show beside new ones), per-platform
  caption tabs (CT-06; previews already honour per-placement captions), exporting a preview as an image.

### Calendar (`/o/[org]/s/[space]/calendar`, `/o/[org]/overview/calendar`, PRD OV-04 to OV-08, VW-04, TK-02)

- Month, Week, Day and List views with Today and previous/next; the view and date live in the URL. The organisation
  calendar sits next to the Dashboard under Overview and combines every space you can see ("Calendars" picks which).
- Filters: content and/or tasks, assigned to me, unassigned or a person, publishing state, status category, autopost on.
- Colour by platform or by status, and the first day of the week, are saved per person (Profile calendar preferences).
- Hover shows a preview card (cover, platforms, status, publishing, caption); click opens the content panel over the
  calendar, and closing returns to the same view.
- Drag to move (OV-06): posts and tasks move to a day (keeping their time) or, in Week and Day, to a 15-minute slot. A post
  already scheduled to publish asks for confirmation and is rescheduled through the same readiness check as the
  Schedule dialog; if it isn't ready, the reasons and fixes are shown with Retry. Other posts just get a new planned date.
  Published posts don't move.
- Day view has a mini month and an "Unscheduled" tray to drag posts onto a time (OV-07); Week view has the tray too.
- Load errors say what failed and offer Retry (OV-08).
- Not yet: Google Calendar sync, a keyboard alternative to dragging (use the post's Schedule dialog), tasks without a post
  opening their own panel.
- Add from the calendar: "+" on a day (10 AM) or a click on an empty time in Week and Day opens a small menu for a
  post planned then or a task due then; on the organisation calendar it also asks which space. The new item opens
  straight away.

### Publishing (content panel, `settings/autopost`, PRD 6.10, PB-03 to PB-12)

- Platforms per post (PB-05): add or remove placements in the content panel; Instagram Reels can also share to the feed.
  The space's single connected account per platform is used automatically.
- Three ways to publish (PB-03): **Post now**, **Schedule with autopost** (the queue publishes it), or **Schedule without**
  (the people on the post get a reminder at that time, with Copy caption and Download media in the panel).
- Readiness check (PB-06, `src/lib/publishing/rules.ts`): account connected and publishable; media type, count, ratio,
  duration and size per placement; caption and hashtag limits; status allowed to autopost; client approval of the current
  version when the space requires it; time in the future. It runs when scheduling and again just before publishing. The
  panel shows it live ("Ready to post automatically" or what to fix). Failures open "Fix these issues before posting"
  with one fix button per issue (PB-07).
- Publish jobs (PB-08): one per placement at the scheduled time, ahead of syncs. Temporary errors retry at 30 s, 2 min
  and 8 min; permanent ones fail at once with Meta's reason. The step before the final publish call is recorded, so a
  crash is never retried blindly into a double post. A safety net re-queues due placements whose job went missing and
  fails ones that missed their time by more than 6 hours instead of posting late.
- Results per placement (PB-09, PB-11): Published with "View post", Failed with the reason and Retry, and "Partially
  published" on the post when only some went out. Published posts join analytics and the hourly sync collects their numbers.
- Failures (PB-10): in-app notification to the assignees and the space's Managers at once (bell in the top bar), and an
  email if still unresolved after 30 minutes (Resend).
- Mark as posted manually (PB-12) with the post link. When the hourly sync later finds a post with the same link, it
  takes over that row, so analytics doesn't count it twice.
- Autopost settings (PB-04): autopost on for new content, which statuses can autopost, require client approval, and
  whether Editors can schedule.
- Meta downloads media from signed links that expire after 6 hours (`/api/media/public/[id]`); images are converted to
  JPEG because Instagram accepts nothing else. Meta can't reach localhost, so live publishing needs `APP_URL` set to a
  public address (a tunnel such as ngrok or Cloudflare Tunnel works for testing). The readiness check says so.
- Sample mode: publishing works without Meta keys. Put `#samplefail` in a caption to see a failure, or `#sampleflaky` for
  a temporary error that succeeds on the automatic retry.
- Not yet: LinkedIn, per-placement caption overrides in the UI, a full Notifications page and preferences (6.18), and
  space-level defaults per placement beyond "share Reels to feed".

### Instagram and Facebook connection (`/o/[org]/s/[space]/settings/accounts`, PRD SP-04, OB-05, OB-07, section 9)

- "Connect Instagram and Facebook" goes through Facebook Login (Graph API v26.0, Instagram API with Facebook Login). The
  callback checks a one-time state cookie, swaps the code for a long-lived token and lists the person's Pages with their
  linked Instagram professional accounts. The picker (step two) chooses which belong to the space; accounts already in
  another space are blocked. Only Managers and above can connect or disconnect (`accounts.connect`).
- Page tokens are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`, `TOKEN_ENCRYPTION_KEY`) and never reach the
  browser. The 15-minute picker session is encrypted too.
- On connect, the 90-day history import runs as a background job with a progress bar on the Accounts page and a banner
  across the space (OB-07). Facebook Pages also backfill daily follower totals; Instagram follower history starts on the day
  of connection because Instagram only reports new followers per day. Connecting real accounts replaces the seeded sample ones.
- Token health (SP-04): Active, Expires in N days (warned 7 days before Meta's 90-day data-access expiry), Reconnect needed.
  A revoked token stops syncing, shows a banner across the space and logs the change. Reconnecting uses the same flow.
- Disconnect deletes the token and stops syncing; imported posts stay in analytics.
- Jobs (`src/jobs/`): a Postgres queue (`FOR UPDATE SKIP LOCKED`) instead of Redis and BullMQ, so there is one less service to run.
  Priorities (publishing will come first), one running job per account, retries at 30 s / 2 min / 8 min, permanent errors
  not retried, stale locks reclaimed. Hourly sync takes post snapshots at 1 h, 24 h, 3, 7 and 30 days after publishing, then
  freezes them; daily follower snapshot; daily token check. The analytics Refresh button and "Sync now" queue a sync.
- Sample mode: without `META_APP_ID` the whole flow runs on generated accounts (Cafe Delhi with Instagram, Green Leaf Realty
  with an expiring token), marked as sample data.
- Not yet: AI tagging of imported posts by pillar and topic (the audit's pillar findings need it), Instagram Stories
  history (Meta only exposes Stories for 24 hours), notifications for token problems (NT-02).

### AI Copilot (`/o/[org]/ai`, PRD 6.14, CT-08, AI-10)

- Chat scoped to the whole organisation or one space, with conversation history, reasoning levels (effort) and built-in
  prompt templates. Answers stream in; the Copilot reads real data through tools (space snapshot, analytics, audit, posts,
  Brand Brain) built on the same engines as the Analytics and First audit pages.
- Source labels (AI-07): the model tags claims `[Your data]` or `[AI suggestion]`; every number in a data claim is checked
  against the tool results and shown as "Check this" when it isn't there (`src/lib/ai/claims.ts`).
- Action cards (AI-05, AI-06, AI-14): "plan posts" and "rewrite captions" become cards you can edit, approve or dismiss.
  Approval runs with your own permissions, is logged "by AI Copilot for <you>", and can be undone (things someone changed
  since are kept). Changed captions clear client approvals like any edit.
- Brand Brain per space (`/s/[space]/brand`): all PRD fields, completeness meter, draft from the website (fetched on
  Anthropic's side, never by our server) or from a pasted ChatGPT/Claude answer. Drafts fill only empty fields.
- Inline caption help in the content panel (CT-08): Write, Improve, Shorten, Hinglish, Hindi, Hooks, Hashtags, shown as
  suggestions to replace or insert.
- Credits and budget (AI-13): usage metered per call, monthly hard cap per organisation, usage by member, space and feature
  in AI settings.
- Models (`src/lib/ai/config.ts`): `claude-opus-5-5` for the Copilot and Brand Brain; `claude-sonnet-5-5` for inline caption
  help (the PRD's cheaper model for high-volume writing). Server-side refusal fallback is on. Set `ANTHROPIC_API_KEY`.
- AI navigation: Prompts, Workflows, Runs and Your persona, above the conversations.
- Prompt library (`/o/[org]/ai/prompts`): built-in prompts grouped by Planning, Writing, Analysis and Across clients,
  and your own saved prompts (`ai_prompts`); Use opens a chat with the prompt filled in.
- Your persona (`/o/[org]/ai/persona`, `ai_personas`): your role, how you work, how you write and what to avoid, added to
  the Copilot's system prompt in your conversations only (after the cached part, so caching still works). A prompt
  to copy into Claude or ChatGPT helps write it.
- Workflows (`/o/[org]/ai/workflows`, `src/ai/workflows.ts`): recurring jobs run by the job worker every minute when due,
  daily, weekly on a chosen day or monthly on the 1st, at a local hour. Templates: Weekly content ideas (AI, adds ideas
  to the Idea Bank), Festival planner (festivals in the next 45 days, ideas with AI), Weekly analytics digest (numbers,
  plus a short AI read when AI is set up), Overdue task digest and Unscheduled content check (no AI), and Custom (your
  prompt, answered from the space's Brand Brain, results and plan). Run now, pause and delete; the person who made it
  is notified with a link to the run. AI use counts against the monthly budget and stops when the plan is locked.
- Runs (`/o/[org]/ai/runs`): every run with its status (filter by Queued, Running, Completed, Failed), output and error.

### Milestone 0

- Organisation and space shell with role-aware sidebar (members only see their spaces).
- Overview: setup checklist, content by status category, waiting for client approval, upcoming posts.
- Board with drag and drop between statuses, Table view, create content.
- Content panel (`?content=id`): inline title, caption and hashtag editing with autosave, caption limits per platform,
  status and publish state side by side, private comments, change log, client comments.
- Client review: one link for everything in "Client review", WhatsApp share, mobile review page with name entry, approve,
  request changes with a note. Decisions move the post to the mapped status. Editing approved content clears the approval and
  returns the post to review (SH-07).

## Next milestones

1. Connect Razorpay (India) and Stripe (elsewhere) to billing: checkout, webhooks, payment methods.
2. Cloud storage driver (R2 or S3).
3. AI: workflows and runs (AI-15, AI-16), competitor and trend intelligence with web sources (6.17), memories (AI-11).
4. Space logos and custom planning-only platforms (SP-01, SP-03).
