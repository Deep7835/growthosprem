import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { aiActions, brandBrains, contentItems, placements, socialAccounts, statuses } from "@/db/schema";
import { formatSchedule } from "@/lib/format";
import { getSpaceAnalytics } from "@/server/analytics";
import { getSpaceAudit } from "@/server/audit";
import { listVisibleSpaces, spaceContextForRoute } from "@/server/tenancy";
import { AnalyticsInput, ListPostsInput, ProposeCaptions, ProposeDraftPosts, ProposeIdeas, SpaceInput } from "./schemas";

export interface CopilotScope {
  orgSlug: string;
  orgId: string;
  userId: string;
  conversationId: string;
  /** Set when the conversation is scoped to one space (AI-02). */
  spaceSlug: string | null;
}

type Tool = Anthropic.Beta.BetaTool;

const space = { type: "string", description: "The space's slug. Leave out when the conversation is about one space." } as const;

// Order and wording stay fixed so the cached prompt prefix stays valid.
export const COPILOT_TOOLS: Tool[] = [
  {
    name: "list_spaces",
    description: "Lists the spaces (one per client or brand) the person can see, with their slugs. Use it when the conversation covers the whole organisation.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_space_snapshot",
    description: "Current state of a space: posts per status, posts scheduled in the next 14 days, and connected accounts.",
    input_schema: { type: "object", properties: { space }, additionalProperties: false },
  },
  {
    name: "get_analytics",
    description:
      "Computed analytics for a space over the last 7, 30 or 90 days: followers, growth, engagement, views, posts, per-platform numbers, comparison with the previous period when available, top posts and breakdowns by format, pillar, topic, hook type and time. These are the only numbers you may state as facts.",
    input_schema: {
      type: "object",
      properties: { space, days: { type: "integer", enum: [7, 30, 90], description: "Period length. Default 30." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_audit",
    description: "The space's 90-day audit: what is working, what is not, recommendations with their evidence, and a draft two-week plan.",
    input_schema: { type: "object", properties: { space }, additionalProperties: false },
  },
  {
    name: "list_posts",
    description: "Posts in a space with id, title, status, schedule, platforms, pillar and caption. Filter by status name and by scheduled date range.",
    input_schema: {
      type: "object",
      properties: {
        space,
        status: { type: "string", description: "Status name, for example Idea or Client review." },
        from: { type: "string", description: "Scheduled on or after this date, YYYY-MM-DD." },
        to: { type: "string", description: "Scheduled on or before this date, YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_brand_brain",
    description: "What the brand has told us about itself: description, audience, voice, dos and don'ts, offers, USPs, FAQs, competitors and caption language.",
    input_schema: { type: "object", properties: { space }, additionalProperties: false },
  },
  {
    name: "propose_draft_posts",
    description:
      "Proposes new draft posts for a space as an action card. Nothing is created until the person approves it, and they can edit the card first. Use it whenever the person asks for a plan, calendar or posts.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        space,
        summary: { type: "string", description: "One line describing the drafts, shown on the card." },
        posts: {
          type: "array",
          maxItems: 14,
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD in the space's timezone." },
              time: { type: "string", description: "HH:MM, 24-hour, in the space's timezone." },
              title: { type: "string", description: "Short working title, which is the hook." },
              placements: {
                type: "array",
                items: { type: "string", enum: ["ig_post", "ig_reel", "ig_story", "ig_carousel", "fb_post", "fb_reel", "fb_story", "li_post"] },
              },
              pillar: { type: "string" },
              caption: { type: "string", description: "Draft caption in the brand's voice and caption language." },
            },
            required: ["date", "time", "title", "placements"],
            additionalProperties: false,
          },
        },
      },
      required: ["posts"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_captions",
    description:
      "Proposes new captions (and optionally hashtags) for existing posts as an action card. Nothing changes until the person approves. Get post ids from list_posts first.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        space,
        summary: { type: "string" },
        changes: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            properties: { post_id: { type: "string" }, caption: { type: "string" }, hashtags: { type: "string" } },
            required: ["post_id", "caption"],
            additionalProperties: false,
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_ideas",
    description:
      "Proposes ideas for the space's Idea Bank as an action card (AI-05: Add to Idea Bank). Use it for brainstorming, trend or competitor angles the person wants to keep without scheduling yet. Nothing is saved until the person approves.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        space,
        summary: { type: "string" },
        ideas: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "The idea as a short working title or hook." },
              notes: { type: "string", description: "The angle: what to show and why it should work for this brand." },
              pillar: { type: "string", description: "Content pillar, reusing the brand's existing pillars where they fit." },
              source: { type: "string", enum: ["ai", "trend", "competitor"] },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["ideas"],
      additionalProperties: false,
    },
  },
];

export const PROPOSAL_TOOLS = new Set(["propose_draft_posts", "propose_captions", "propose_ideas"]);
export const TOOL_LABELS: Record<string, string> = {
  list_spaces: "Looking at your spaces",
  get_space_snapshot: "Checking the board",
  get_analytics: "Reading analytics",
  get_audit: "Reading the audit",
  list_posts: "Reading posts",
  get_brand_brain: "Reading Brand Brain",
  propose_draft_posts: "Preparing draft posts",
  propose_captions: "Preparing captions",
  propose_ideas: "Collecting ideas",
};

class ToolError extends Error {}

async function resolveSpace(scope: CopilotScope, slug: string | undefined, action: "analytics.view" | "content.edit") {
  const target = slug ?? scope.spaceSlug;
  if (!target) throw new ToolError("Say which space: call list_spaces to get the slugs.");
  const { ctx } = await spaceContextForRoute(scope.orgSlug, target, action);
  if (!ctx) throw new ToolError(`You can't ${action === "content.edit" ? "change" : "see"} the space "${target}".`);
  return ctx;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Runs one tool. Returns the text given back to the model; proposals also store an action card. */
export async function runTool(scope: CopilotScope, name: string, input: unknown, toolUseId: string): Promise<{ content: string; isError?: boolean; actionId?: string }> {
  try {
    switch (name) {
      case "list_spaces": {
        const spaces = await listVisibleSpaces(scope.orgSlug);
        return { content: JSON.stringify(spaces.map((s) => ({ slug: s.slug, name: s.name, timezone: s.timezone }))) };
      }
      case "get_space_snapshot": {
        const ctx = await resolveSpace(scope, SpaceInput.parse(input).space, "analytics.view");
        const data = await withOrg(ctx.org.id, async (tx) => {
          const now = new Date();
          const [statusList, items, accounts] = await Promise.all([
            tx.select().from(statuses).where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.appliesTo, "content"))).orderBy(asc(statuses.position)),
            tx.select().from(contentItems).where(and(eq(contentItems.spaceId, ctx.space.id), isNull(contentItems.archivedAt))),
            tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id)),
          ]);
          const soon = items.filter((i) => i.scheduledAt && i.scheduledAt >= now && i.scheduledAt.getTime() - now.getTime() < 14 * 864e5);
          return {
            space: ctx.space.name,
            timezone: ctx.space.timezone,
            postsByStatus: statusList.map((s) => ({ status: s.name, posts: items.filter((i) => i.statusId === s.id).length })),
            scheduledNext14Days: soon.map((i) => ({ title: i.title, when: formatSchedule(i.scheduledAt, ctx.space.timezone), status: statusList.find((s) => s.id === i.statusId)?.name })),
            connectedAccounts: accounts.map((a) => ({ platform: a.platform, handle: a.handle, sampleData: a.isDemo })),
          };
        });
        return { content: JSON.stringify(data) };
      }
      case "get_analytics": {
        const args = AnalyticsInput.parse(input ?? {});
        const ctx = await resolveSpace(scope, args.space, "analytics.view");
        const result = await getSpaceAnalytics(ctx, { days: args.days, platform: "all" });
        if (result.state !== "ready") return { content: "This space has no connected accounts, so there are no analytics yet." };
        const r = result.report;
        return {
          content: JSON.stringify({
            period: `${r.range.start} to ${r.range.end}`,
            sampleData: result.isDemo,
            comparisonAvailable: r.canCompare,
            followers: r.kpis.followers.value,
            followersAtStart: r.kpis.followers.start,
            followerGrowth: r.kpis.followerGrowth,
            engagement: { value: r.kpis.engagement.value, previous: r.kpis.engagement.previous },
            engagementRate: { value: pct(r.kpis.engagementRate.value), previous: r.kpis.engagementRate.previous == null ? null : pct(r.kpis.engagementRate.previous) },
            views: { value: r.kpis.views.value, previous: r.kpis.views.previous },
            posts: { value: r.kpis.posts.value, previous: r.kpis.posts.previous },
            platforms: r.platforms.map((p) => ({ platform: p.platform, followers: p.followers, growth: p.growth, views: p.views, posts: p.posts, engagementRate: pct(p.engagementRate) })),
            topPostsByViews: r.posts.slice(0, 5).map((p) => ({ title: p.title, format: p.format, platform: p.platform, views: p.views, engagementRate: pct(p.engagementRate) })),
            byFormatLast90Days: r.breakdowns.byFormat.map((g) => ({ format: g.name, posts: g.posts, engagementRate: g.engagementRate == null ? "not enough posts" : pct(g.engagementRate) })),
            byPillarLast90Days: r.breakdowns.byPillar.map((g) => ({ pillar: g.name, posts: g.posts, engagementRate: g.engagementRate == null ? "not enough posts" : pct(g.engagementRate) })),
            // From AI tags; empty until posts are tagged.
            byTopicLast90Days: r.breakdowns.byTopic.map((g) => ({ topic: g.name, posts: g.posts, engagementRate: g.engagementRate == null ? "not enough posts" : pct(g.engagementRate) })),
            byHookTypeLast90Days: r.breakdowns.byHook.map((g) => ({ hookType: g.name, posts: g.posts, engagementRate: g.engagementRate == null ? "not enough posts" : pct(g.engagementRate) })),
            whatHappened: r.insights.happened,
          }),
        };
      }
      case "get_audit": {
        const ctx = await resolveSpace(scope, SpaceInput.parse(input ?? {}).space, "analytics.view");
        const result = await getSpaceAudit(ctx);
        if (result.state !== "ready") return { content: "No audit: this space has no connected accounts." };
        const a = result.audit;
        return {
          content: JSON.stringify({
            sampleData: result.isDemo,
            posts: a.postCount,
            findings: a.findings.map((f) => ({ kind: f.kind, finding: `${f.head} ${f.text}`, basedOn: f.sample })),
            recommendations: a.recommendations.map((r) => ({ title: r.title, why: r.rationale, basedOn: r.sample })),
            draftPlan: a.plan.map((p) => ({ date: p.date, time: p.time, format: p.format, pillar: p.pillar, title: p.title, placements: p.placements })),
          }),
        };
      }
      case "list_posts": {
        const args = ListPostsInput.parse(input ?? {});
        const ctx = await resolveSpace(scope, args.space, "analytics.view");
        const rows = await withOrg(ctx.org.id, async (tx) => {
          const filters = [eq(contentItems.spaceId, ctx.space.id), isNull(contentItems.archivedAt)];
          if (args.from) filters.push(gte(contentItems.scheduledAt, new Date(`${args.from}T00:00:00Z`)));
          if (args.to) filters.push(lte(contentItems.scheduledAt, new Date(`${args.to}T23:59:59Z`)));
          const items = await tx
            .select({ item: contentItems, status: statuses.name })
            .from(contentItems)
            .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
            .where(and(...filters))
            .orderBy(asc(contentItems.scheduledAt))
            .limit(60);
          const ids = items.map((i) => i.item.id);
          const pl = ids.length ? await tx.select().from(placements).where(inArray(placements.contentItemId, ids)) : [];
          return items
            .filter((i) => !args.status || i.status.toLowerCase() === args.status.toLowerCase())
            .map(({ item, status }) => ({
              id: item.id,
              title: item.title,
              status,
              scheduled: formatSchedule(item.scheduledAt, ctx.space.timezone),
              placements: pl.filter((p) => p.contentItemId === item.id).map((p) => p.kind),
              pillar: item.pillar,
              caption: item.caption.slice(0, 600),
              hashtags: item.hashtags,
            }));
        });
        return { content: JSON.stringify(rows) };
      }
      case "get_brand_brain": {
        const ctx = await resolveSpace(scope, SpaceInput.parse(input ?? {}).space, "analytics.view");
        const [brain] = await withOrg(ctx.org.id, (tx) => tx.select().from(brandBrains).where(eq(brandBrains.spaceId, ctx.space.id)));
        if (!brain) return { content: `${ctx.space.name} has no Brand Brain yet. Write in a friendly, clear voice and suggest filling in Brand Brain.` };
        const { website, description, audience, voice, dos, donts, offers, usps, faqs, competitors, captionLanguage } = brain;
        return { content: JSON.stringify({ space: ctx.space.name, website, description, audience, voice, dos, donts, offers, usps, faqs, competitors, captionLanguage }) };
      }
      case "propose_draft_posts":
      case "propose_captions":
      case "propose_ideas": {
        const parsed = name === "propose_draft_posts" ? ProposeDraftPosts.parse(input) : name === "propose_ideas" ? ProposeIdeas.parse(input) : ProposeCaptions.parse(input);
        const ctx = await resolveSpace(scope, parsed.space, "content.edit");
        if (name === "propose_captions") {
          const ids = (parsed as z.infer<typeof ProposeCaptions>).changes.map((c) => c.post_id);
          const found = await withOrg(ctx.org.id, (tx) =>
            tx.select({ id: contentItems.id }).from(contentItems).where(and(inArray(contentItems.id, ids), eq(contentItems.spaceId, ctx.space.id))),
          );
          if (found.length !== new Set(ids).size) throw new ToolError("Some post ids are not in this space. Use ids from list_posts.");
        }
        const [action] = await withOrg(ctx.org.id, (tx) =>
          tx
            .insert(aiActions)
            .values({ orgId: ctx.org.id, conversationId: scope.conversationId, spaceId: ctx.space.id, toolUseId, tool: name, payload: { ...parsed, space: ctx.space.slug } })
            .returning(),
        );
        return {
          content: "Shown to the person as an action card. Nothing has changed yet: they can edit it, then approve or dismiss. Tell them briefly what is on the card.",
          actionId: action.id,
        };
      }
      default:
        return { content: `Unknown tool ${name}.`, isError: true };
    }
  } catch (e) {
    if (e instanceof z.ZodError) return { content: `Invalid input: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
    if (e instanceof ToolError) return { content: e.message, isError: true };
    throw e;
  }
}
