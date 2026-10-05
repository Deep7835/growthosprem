// Core MVP entities from PRD section 8.
// Rule: every tenant row carries org_id, and every table with org_id gets a
// row-level security policy in a drizzle/ migration (checked by src/db/rls.test.ts).
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orgRole = pgEnum("org_role", ["owner", "admin", "manager", "editor"]);
export const accountType = pgEnum("account_type", ["agency", "brand"]);
export const statusCategory = pgEnum("status_category", [
  "not_started",
  "active",
  "completed",
  "closed",
]);
export const statusAppliesTo = pgEnum("status_applies_to", ["content", "task"]);
// A status's part in client review: what gets shared, and where a client's
// decision moves the item (SH-06, SH-07).
export const reviewRole = pgEnum("review_role", ["in_review", "approved", "changes_requested"]);
// System-controlled; never mixed with workflow status (PRD 6.4).
export const publishState = pgEnum("publish_state", [
  "not_scheduled",
  "scheduled",
  "publishing",
  "published",
  "partially_published",
  "failed",
]);
export const platform = pgEnum("platform", ["instagram", "facebook", "linkedin"]);
export const placementKind = pgEnum("placement_kind", [
  "ig_post",
  "ig_reel",
  "ig_story",
  "ig_carousel",
  "fb_post",
  "fb_reel",
  "fb_story",
  "li_post",
]);
export const accountStatus = pgEnum("account_status", ["active", "expiring", "reconnect_needed", "disconnected"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const commentVisibility = pgEnum("comment_visibility", ["private", "public"]);
export const actorKind = pgEnum("actor_kind", ["user", "ai", "reviewer", "system"]);
export const sharePermission = pgEnum("share_permission", ["view", "comment", "approve"]);
export const reviewDecision = pgEnum("review_decision", ["approved", "changes_requested"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  accountType: accountType("account_type").notNull().default("agency"),
  country: text("country").notNull().default("IN"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  locale: text("locale").notNull().default("en-IN"),
  brandColor: text("brand_color"),
  // Free trial (OB-10); billing replaces this with the subscription.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // Monthly AI budget in credits, a hard cap (AI-13). 1 credit = US$0.01 of model usage.
  aiMonthlyCredits: integer("ai_monthly_credits").notNull().default(1000),
  createdAt: createdAt(),
});

// Global identities; tenant access is granted through memberships.
/** A person's saved Table view for one space (VW-02): columns, filters and sort. */
export interface TableView {
  columns?: string[];
  filters?: Record<string, string>;
  sort?: string;
}

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Identity from the auth provider (Clerk). Null for seeded or invited users who have not signed in yet.
  clerkUserId: text("clerk_user_id").unique(),
  // Profile › calendar preferences (PRD 6.20): colour items by platform or status, first day of the week.
  preferences: jsonb("preferences")
    .$type<{ calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6; tables?: Record<string, TableView> }>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull(),
    // Shown in Settings › Members (TM-03); updated at most every few minutes.
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.orgId, t.userId)],
);

export const spaces = pgTable(
  "spaces",
  {
    id: id(),
    orgId: orgId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    avatarColor: text("avatar_color").notNull().default("#F2A93B"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    defaultLanguage: text("default_language").notNull().default("en"),
    autopostNewContent: boolean("autopost_new_content").notNull().default(false),
    requireClientApproval: boolean("require_client_approval").notNull().default(true),
    editorsCanSchedule: boolean("editors_can_schedule").notNull().default(false),
    // Last manual analytics refresh; limited to once every 15 minutes (AN-10).
    metricsRefreshedAt: timestamp("metrics_refreshed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("spaces_org_slug").on(t.orgId, t.slug)],
);

export const spaceMembers = pgTable(
  "space_members",
  {
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  platform: platform("platform").notNull(),
  handle: text("handle").notNull(),
  externalId: text("external_id"),
  accountType: text("account_type"),
  name: text("name"),
  // For Instagram: the Facebook Page it is linked to (Instagram API with Facebook Login).
  pageId: text("page_id"),
  // AES-256-GCM, see src/lib/crypto.ts. Never sent to the browser.
  accessTokenEnc: text("access_token_enc"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: accountStatus("status").notNull().default("active"),
  statusReason: text("status_reason"),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  // While a job is waiting or running: "import_queued", "importing", "queued", "syncing".
  // "import_failed" once the history import gave up.
  syncState: text("sync_state"),
  // Posts processed so far, for the import progress bar (OB-07).
  syncProgress: jsonb("sync_progress").$type<{ done: number; total: number }>(),
  // Seeded sample accounts for development; the UI labels their numbers as sample data.
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  },
  (t) => [uniqueIndex("social_accounts_space_external").on(t.spaceId, t.platform, t.externalId)],
);

export const statuses = pgTable(
  "statuses",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    category: statusCategory("category").notNull(),
    appliesTo: statusAppliesTo("applies_to").notNull().default("content"),
    position: integer("position").notNull(),
    autopostEligible: boolean("autopost_eligible").notNull().default(false),
    reviewRole: reviewRole("review_role"),
  },
  (t) => [index("statuses_space").on(t.spaceId, t.position)],
);

export const projects = pgTable("projects", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  goal: text("goal"),
  startsOn: text("starts_on"),
  endsOn: text("ends_on"),
  color: text("color"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    statusId: uuid("status_id").notNull().references(() => statuses.id),
    publishState: publishState("publish_state").notNull().default("not_scheduled"),
    pillar: text("pillar"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    autopost: boolean("autopost").notNull().default(false),
    caption: text("caption").notNull().default(""),
    hashtags: text("hashtags").notNull().default(""),
    firstComment: text("first_comment").notNull().default(""),
    groupId: uuid("group_id"),
    position: doublePrecision("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Archived posts leave the Board, Calendar and Previews but can be restored from the Table (VW-03).
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("content_items_space_status").on(t.spaceId, t.statusId)],
);

export const contentAssignees = pgTable(
  "content_assignees",
  {
    orgId: orgId(),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contentItemId, t.userId] })],
);

// Per-placement publishing result (PB-09); the item's publish state is derived from these.
export const placementState = pgEnum("placement_state", ["draft", "scheduled", "publishing", "published", "failed"]);

export const placements = pgTable("placements", {
  id: id(),
  orgId: orgId(),
  contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
  kind: placementKind("kind").notNull(),
  socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
  // Null means the item's shared caption is used (CT-06).
  captionOverride: text("caption_override"),
  // Platform options (PB-05), e.g. { shareToFeed: true } for Instagram Reels.
  options: jsonb("options").$type<{ shareToFeed?: boolean }>().notNull().default({}),
  state: placementState("state").notNull().default("draft"),
  // How far the publish call got, so a retry never posts twice: "container" or "publish_sent".
  publishStep: text("publish_step"),
  containerId: text("container_id"),
  externalId: text("external_id"),
  permalink: text("permalink"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedManually: boolean("published_manually").notNull().default(false),
  error: text("error"),
  errorRetryable: boolean("error_retryable"),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Tasks (PRD 6.8, TK-01): the work behind a post, a project or the space. `done` mirrors whether
// the status is in Completed or Closed, so progress counts stay a cheap query.
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // Task statuses are the space's statuses that apply to tasks (ST-03).
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: taskPriority("priority").notNull().default("medium"),
    done: boolean("done").notNull().default(false),
    checklist: jsonb("checklist").$type<{ id: string; text: string; done: boolean }[]>().notNull().default([]),
    position: doublePrecision("position").notNull().default(0),
    // The template step that made it (TK-04), so a template is never applied twice.
    templateKey: text("template_key"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_space").on(t.spaceId, t.statusId), index("tasks_content").on(t.contentItemId), index("tasks_assignee").on(t.assigneeId, t.dueAt)],
);

// Comments on a task (TK-01). Separate from post comments, so client reviewers can never see them (SH-05).
export const taskComments = pgTable(
  "task_comments",
  {
    id: id(),
    orgId: orgId(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("task_comments_task").on(t.taskId, t.createdAt)],
);

export const comments = pgTable("comments", {
  id: id(),
  orgId: orgId(),
  contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  authorReviewerName: text("author_reviewer_name"),
  visibility: commentVisibility("visibility").notNull(),
  body: text("body").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    actorKind: actorKind("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    // "Prem", "AI Copilot for Prem", "Anjali (client)".
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    field: text("field"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_target").on(t.targetType, t.targetId, t.at)],
);

export const shareLinks = pgTable("share_links", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  title: text("title").notNull(),
  permission: sharePermission("permission").notNull().default("approve"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const shareLinkItems = pgTable(
  "share_link_items",
  {
    orgId: orgId(),
    shareLinkId: uuid("share_link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.shareLinkId, t.contentItemId] })],
);

// An approval is only valid while version_hash matches the item's current
// content (SH-07); see src/lib/content-version.ts.
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    orgId: orgId(),
    shareLinkId: uuid("share_link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    decision: reviewDecision("decision").notNull(),
    reviewerName: text("reviewer_name").notNull(),
    reviewerEmail: text("reviewer_email"),
    note: text("note"),
    versionHash: text("version_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_item").on(t.contentItemId, t.createdAt)],
);

// Everything on the platforms, including imported history. Exists independently of
// content items so imported and manually posted content can be analysed (PRD 8).
export const postFormat = pgEnum("post_format", ["reel", "carousel", "post", "story"]);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    format: postFormat("format").notNull(),
    title: text("title").notNull(),
    caption: text("caption").notNull().default(""),
    permalink: text("permalink"),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    // AI tags (PRD 9, "AI tagging"): pillar and topic.
    pillar: text("pillar"),
    topic: text("topic"),
  },
  (t) => [
    uniqueIndex("posts_account_external").on(t.socialAccountId, t.externalId),
    index("posts_space_published").on(t.spaceId, t.publishedAt),
  ],
);

// Snapshots at 1 h, 24 h, 3, 7 and 30 days after publishing (PRD 9); the latest one counts.
export const postMetrics = pgTable(
  "post_metrics",
  {
    id: id(),
    orgId: orgId(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    reach: integer("reach").notNull().default(0),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    shares: integer("shares").notNull().default(0),
  },
  (t) => [index("post_metrics_post").on(t.postId, t.takenAt)],
);

export const accountMetricsDaily = pgTable(
  "account_metrics_daily",
  {
    orgId: orgId(),
    socialAccountId: uuid("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    followers: integer("followers").notNull(),
  },
  (t) => [primaryKey({ columns: [t.socialAccountId, t.day] })],
);

// Stored AI findings and suggestions the user acted on (PRD 8, "insights").
export const insights = pgTable(
  "insights",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    statement: text("statement").notNull(),
    evidence: jsonb("evidence").notNull().default({}),
    sourceLabel: text("source_label").notNull(),
    actionedBy: uuid("actioned_by").references(() => users.id, { onDelete: "set null" }),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("insights_space_key").on(t.spaceId, t.key)],
);

// Team invites (TM-01, TM-02). Only a hash of the link token is stored, so a
// database read never reveals a working join link.
export const invites = pgTable(
  "invites",
  {
    id: id(),
    orgId: orgId(),
    email: text("email").notNull(),
    role: orgRole("role").notNull(),
    spaceIds: uuid("space_ids").array().notNull().default(sql`'{}'::uuid[]`),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_org_email").on(t.orgId, t.email)],
);

// Media library (PRD 6.12). Files live in object storage (src/server/storage.ts); rows hold metadata.
export const mediaType = pgEnum("media_type", ["image", "video", "document"]);
export const mediaSource = pgEnum("media_source", ["upload", "ai", "import"]);
export const mediaStatus = pgEnum("media_status", ["uploading", "processing", "ready", "failed"]);

export const mediaFolders = pgTable(
  "media_folders",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // One folder per project when chosen (MD-01); one Brand assets folder per space (MD-04).
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    isBrandAssets: boolean("is_brand_assets").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("media_folders_space").on(t.spaceId)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
    type: mediaType("type").notNull(),
    source: mediaSource("source").notNull().default("upload"),
    status: mediaStatus("status").notNull().default("uploading"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: doublePrecision("duration_seconds"),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    error: text("error"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("media_assets_space").on(t.spaceId, t.createdAt)],
);

// Media attached to a post, in order; the first image is the cover where platforms allow (CT-02).
export const contentMedia = pgTable(
  "content_media",
  {
    orgId: orgId(),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.contentItemId, t.mediaAssetId] }), index("content_media_asset").on(t.mediaAssetId)],
);

// Brand Brain per space (AI-10): what the AI knows about the brand.
export const brandBrains = pgTable("brand_brains", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().unique().references(() => spaces.id, { onDelete: "cascade" }),
  website: text("website").notNull().default(""),
  description: text("description").notNull().default(""),
  audience: text("audience").notNull().default(""),
  voice: text("voice").notNull().default(""),
  dos: text("dos").notNull().default(""),
  donts: text("donts").notNull().default(""),
  offers: text("offers").notNull().default(""),
  usps: text("usps").notNull().default(""),
  faqs: text("faqs").notNull().default(""),
  competitors: text("competitors").notNull().default(""),
  // en, hi or hinglish (AI-12).
  captionLanguage: text("caption_language").notNull().default("en"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// AI Copilot conversations (AI-01, AI-02). Scope is the whole organisation or one space.
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_conversations_user").on(t.userId, t.updatedAt)],
);

// Messages exactly as sent to and returned by the model, append-only, so history
// replays unchanged (thinking blocks are only valid when echoed back verbatim).
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_conversation").on(t.conversationId, t.createdAt)],
);

// Changes the Copilot proposes; nothing happens until a person approves (AI-05, AI-06, AI-14).
export const aiActionState = pgEnum("ai_action_state", ["proposed", "executed", "dismissed", "failed", "undone"]);

export const aiActions = pgTable(
  "ai_actions",
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    toolUseId: text("tool_use_id").notNull(),
    tool: text("tool").notNull(),
    payload: jsonb("payload").notNull(),
    state: aiActionState("state").notNull().default("proposed"),
    result: jsonb("result"),
    error: text("error"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_actions_conversation").on(t.conversationId)],
);

// Metered AI usage for budgets and the usage view (AI-13).
export const usageEvents = pgTable(
  "usage_events",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    credits: integer("credits").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("usage_events_org").on(t.orgId, t.createdAt)],
);

// Between Meta's login callback and the person choosing which Pages to connect. Holds the
// encrypted candidate list (with Page tokens) for 15 minutes.
export const oauthSessions = pgTable("oauth_sessions", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  dataEnc: text("data_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// Background jobs (PRD 9): history import, metrics sync, token health. Processed by a worker
// with the privileged connection, so the tenant lives in the payload, not an org_id column.
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    // Lower runs first: publishing (0) always before syncs (5) (PRD 9).
    priority: integer("priority").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    // At most one pending job per key, e.g. one daily sync per account per day.
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_due").on(t.doneAt, t.failedAt, t.priority, t.runAt)],
);

// Notifications (PRD 6.18). One row per person per event; `inApp` false means the person only
// wanted it by email (NT-03). Cleared ones move to the Cleared tab (NT-01).
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    // Fine-grained event, e.g. "publish_failed" or "mention"; its type (NT-02) comes from src/lib/notifications.ts.
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    inApp: boolean("in_app").notNull().default(true),
    // "pending" until the worker emails it, then "sent" or "skipped"; null when email is off.
    emailStatus: text("email_status"),
    // The same for browser push (NT-03).
    pushStatus: text("push_status"),
    // Repeating events (a task due tomorrow, a token about to expire) notify once per key.
    key: text("key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user").on(t.userId, t.createdAt),
    uniqueIndex("notifications_user_key").on(t.userId, t.key),
    index("notifications_email").on(t.emailStatus),
    index("notifications_push").on(t.pushStatus),
  ],
);

// Browser push subscriptions (NT-03), one per browser a person turned notifications on in.
// Not tied to an organisation, so like `jobs` it is read only by the server and the worker.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Notification preferences (NT-03, NT-04): one row for the person's defaults ("default") and
// one per space they changed. Missing rows fall back to the defaults in src/lib/notifications.ts.
export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    settings: jsonb("settings")
      .$type<{ types?: Partial<Record<string, { inApp: boolean; email: boolean; push?: boolean }>>; digest?: boolean; timeZone?: string }>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_settings_scope").on(t.orgId, t.userId, t.scope)],
);

// Notes (VW-06): rich-text briefs and meeting notes per space, optionally for a project.
// `content` is the editor's document (ProseMirror JSON); `text` is its plain text for search.
export const notes = pgTable(
  "notes",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    content: jsonb("content").notNull().default({ type: "doc", content: [] }),
    text: text("text").notNull().default(""),
    // People mentioned, so only new mentions notify.
    mentionIds: uuid("mention_ids").array().notNull().default(sql`'{}'::uuid[]`),
    pinned: boolean("pinned").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_space").on(t.spaceId, t.updatedAt)],
);

// Idea Bank (VW-07): ideas before they become posts.
export const ideaSource = pgEnum("idea_source", ["me", "ai", "trend", "competitor"]);

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    source: ideaSource("source").notNull().default("me"),
    pillar: text("pillar"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Reference links (http/https only) and images from the space's media library.
    links: jsonb("links").$type<{ url: string; title?: string }[]>().notNull().default([]),
    mediaIds: uuid("media_ids").array().notNull().default(sql`'{}'::uuid[]`),
    // Set by "Turn into content".
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ideas_space").on(t.spaceId, t.createdAt)],
);

// Strategy (PRD 6.16): one per space, with its wizard inputs, versions and a share link (SG-01, SG-02).
export const strategies = pgTable("strategies", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().unique().references(() => spaces.id, { onDelete: "cascade" }),
  inputs: jsonb("inputs").notNull().default({}),
  currentVersion: integer("current_version").notNull().default(0),
  // Read-only link for clients; only a hash is stored, like invites.
  shareTokenHash: text("share_token_hash").unique(),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const strategyVersions = pgTable(
  "strategy_versions",
  {
    id: id(),
    orgId: orgId(),
    strategyId: uuid("strategy_id").notNull().references(() => strategies.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    doc: jsonb("doc").notNull(),
    // "starter" (built from data), "ai", "edit" or "restore".
    source: text("source").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("strategy_versions_number").on(t.strategyId, t.version)],
);

// The 30-day plan being edited before "Add to calendar" (SG-03). One open plan per space.
export const contentPlans = pgTable("content_plans", {
  id: id(),
  orgId: orgId(),
  spaceId: uuid("space_id").notNull().unique().references(() => spaces.id, { onDelete: "cascade" }),
  rows: jsonb("rows").notNull().default([]),
  source: text("source").notNull(),
  startsOn: text("starts_on").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A space's own dates for the moment calendar (SG-04): anniversaries, launches, local events.
export const spaceMoments = pgTable(
  "space_moments",
  {
    id: id(),
    orgId: orgId(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: text("date").notNull(),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("space_moments_space").on(t.spaceId, t.date)],
);
