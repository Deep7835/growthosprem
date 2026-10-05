# Growth OS

AI Social Growth OS (working name): plan, create, approve, publish and grow social media from one workspace.
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
  lib/                    permissions, formatting, placements, content versioning
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

1. Cloud storage driver (R2 or S3) for production, and platform-accurate previews per placement (CT-03).
2. Instagram and Facebook connection, history import, scheduling, readiness checks, publishing queue with BullMQ (6.10),
   replacing the sample history. Start Meta app review now: it blocks this milestone.
3. AI: workflows and runs (AI-15, AI-16), competitor and trend intelligence with web sources (6.17), memories (AI-11).
4. Billing with Razorpay and Stripe, plan picker at the end of the trial, seat limits (TM-04).
