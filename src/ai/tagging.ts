// AI tagging (PRD 9): when posts are imported or published, a cheaper model tags each with a
// pillar, a topic and a hook type, so analytics can break results down by them (AN-07).
// Runs in the job worker, in batches per space. Only blanks are filled: a post's pillar from its
// content item, and anything someone set by hand, is never overwritten.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type Db } from "@/db/core";
import { brandBrains, contentItems, organizations, posts, spaces, subscriptions, usageEvents } from "@/db/schema";
import { enqueue, PRIORITY } from "@/jobs/queue";
import { anthropic, credentialsConfigured } from "@/lib/ai/client";
import { WRITING_MODEL, creditsFor, type TokenUsage } from "@/lib/ai/config";
import { HOOK_TYPES } from "@/lib/ai/tags";
import { phaseOf } from "@/lib/billing/plans";

export const TAG_JOB = "ai.tag";
export const TAGGING_MODEL = WRITING_MODEL;
const BATCH = 25;


const Tags = z.object({
  tags: z.array(
    z.object({
      id: z.string(),
      pillar: z.string(),
      topic: z.string(),
      hookType: z.enum(HOOK_TYPES),
    }),
  ),
});
export type TagResult = z.infer<typeof Tags>["tags"][number];

export interface TagInput {
  brand: string;
  pillars: string[];
  posts: { id: string; format: string; caption: string }[];
}

/** The model call, replaceable in tests. */
export type Tagger = (input: TagInput) => Promise<{ tags: TagResult[]; usage: TokenUsage; model: string }>;

const SYSTEM = `You tag a brand's published social media posts so the team can see which themes and hooks work.

For each post give:
- pillar: the recurring theme it belongs to (for example Education, Behind the scenes, Offers, Community). Reuse the brand's existing pillars, spelled exactly as given, whenever one fits. Only add a new pillar when a post clearly fits none; keep the whole set to about 3 to 6. Title Case, 1 to 3 words.
- topic: what this specific post is about, 2 to 4 words in sentence case (for example "Diwali sweets box", "Cold coffee recipe").
- hookType: how the first line grabs attention, one of the listed types. Use "None" when there is no clear hook.

Captions may be in English, Hindi or Hinglish; tags are always in English.`;

export const claudeTagger: Tagger = async (input) => {
  const api = anthropic();
  if (!api) throw new Error("AI isn’t set up.");
  const list = input.posts.map((p) => `- id ${p.id} (${p.format}): ${p.caption.replace(/\s+/g, " ").slice(0, 600) || "(no caption)"}`).join("\n");
  const response = await api.beta.messages.parse({
    model: TAGGING_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(Tags) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Brand: ${input.brand || "not described yet"}\nExisting pillars: ${input.pillars.join(", ") || "none yet"}\n\nPosts:\n${list}\n\nTag every post id.` }],
  });
  if (response.stop_reason === "refusal") throw new Error("AI couldn’t tag these posts.");
  return { tags: response.parsed_output?.tags ?? [], usage: response.usage, model: response.model };
};

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * Tags up to 25 waiting posts in one space. Returns how many were tagged and whether more are
 * waiting. Skips (without failing) when the organisation's AI budget is used up or it's read-only.
 */
export async function tagSpacePosts(db: Db, spaceId: string, deps: { tagger?: Tagger; now?: Date } = {}) {
  const now = deps.now ?? new Date();
  const [space] = await db.select({ id: spaces.id, orgId: spaces.orgId }).from(spaces).where(eq(spaces.id, spaceId));
  if (!space) return { tagged: 0, more: false, skipped: "missing" as const };

  return withOrg(db, space.orgId, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, space.orgId));
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, space.orgId));
    if (phaseOf(sub ?? null, org.trialEndsAt, now).locked) return { tagged: 0, more: false, skipped: "locked" as const };
    const [{ used }] = await tx.select({ used: sql<number>`coalesce(sum(${usageEvents.credits}), 0)::int` }).from(usageEvents).where(gte(usageEvents.createdAt, monthStart(now)));
    if (used >= org.aiMonthlyCredits) return { tagged: 0, more: false, skipped: "budget" as const };

    const waiting = await tx
      .select({ id: posts.id, format: posts.format, caption: posts.caption, pillar: posts.pillar, topic: posts.topic, hookType: posts.hookType })
      .from(posts)
      .where(and(eq(posts.spaceId, spaceId), isNull(posts.taggedAt)))
      .orderBy(desc(posts.publishedAt))
      .limit(BATCH + 1);
    if (waiting.length === 0) return { tagged: 0, more: false };
    const batch = waiting.slice(0, BATCH);

    const [brand] = await tx.select({ description: brandBrains.description }).from(brandBrains).where(eq(brandBrains.spaceId, spaceId));
    const [fromPosts, fromContent] = await Promise.all([
      tx.selectDistinct({ p: posts.pillar }).from(posts).where(and(eq(posts.spaceId, spaceId), isNotNull(posts.pillar))),
      tx.selectDistinct({ p: contentItems.pillar }).from(contentItems).where(and(eq(contentItems.spaceId, spaceId), isNotNull(contentItems.pillar))),
    ]);
    const pillars = [...new Set([...fromPosts, ...fromContent].map((r) => r.p!.trim()).filter(Boolean))].slice(0, 12);

    const result = await (deps.tagger ?? claudeTagger)({ brand: brand?.description ?? "", pillars, posts: batch });
    const byId = new Map(result.tags.map((t) => [t.id, t]));
    let tagged = 0;
    for (const p of batch) {
      const t = byId.get(p.id);
      // A post the model skipped is marked done too, so it isn't retried forever.
      await tx
        .update(posts)
        .set({
          pillar: p.pillar ?? (t?.pillar.trim().slice(0, 60) || null),
          topic: p.topic ?? (t?.topic.trim().slice(0, 80) || null),
          hookType: p.hookType ?? (t && t.hookType !== "None" ? t.hookType : null),
          taggedAt: now,
          tagSource: "ai",
        })
        .where(eq(posts.id, p.id));
      if (t) tagged++;
    }
    await tx.insert(usageEvents).values({
      orgId: space.orgId,
      userId: null,
      spaceId,
      kind: "tagging",
      model: result.model,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: result.usage.cache_creation_input_tokens ?? 0,
      credits: creditsFor(result.model, result.usage),
    });
    return { tagged, more: waiting.length > BATCH };
  });
}

/** The job: one batch, then queue the next straight away while posts are still waiting. */
export async function runTagJob(db: Db, payload: { spaceId: string }, deps: { tagger?: Tagger } = {}) {
  const r = await tagSpacePosts(db, payload.spaceId, deps);
  if (r.more) await enqueue(db, { kind: TAG_JOB, payload: { spaceId: payload.spaceId }, priority: PRIORITY.sync + 1 });
  return r;
}

/** Every minute from the worker: queue tagging for spaces with posts waiting, when AI is set up. */
export async function scheduleTagging(db: Db, now = new Date()) {
  if (!credentialsConfigured()) return 0;
  const rows = await db
    .selectDistinct({ spaceId: posts.spaceId })
    .from(posts)
    .innerJoin(spaces, eq(spaces.id, posts.spaceId))
    .where(and(isNull(posts.taggedAt), isNull(spaces.deletedAt)));
  const bucket = Math.floor(now.getTime() / (10 * 60_000));
  return enqueue(
    db,
    rows.map((r) => ({ kind: TAG_JOB, payload: { spaceId: r.spaceId }, priority: PRIORITY.sync + 1, dedupeKey: `tag:${r.spaceId}:${bucket}` })),
  );
}
