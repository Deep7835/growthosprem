import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import {
  accountMetricsDaily,
  brandBrains,
  contentItems,
  contentPlans,
  ideas,
  organizations,
  placements,
  postMetrics,
  posts,
  socialAccounts,
  spaceMoments,
  spaces,
  statuses,
  strategies,
  strategyVersions,
} from "@/db/schema";
import type { PostFact } from "@/lib/analytics/audit";
import { addDays, isoDate, zonedParts, zonedToUtc } from "@/lib/analytics/time";
import { upcomingMoments, type Moment, type Region } from "@/lib/festivals";
import { PLACEMENTS, type Platform } from "@/lib/placements";
import { normalizeDoc, planDays, PlanRow, starterStrategy, StrategyDoc, StrategyInputs, summarizeHistory, type History } from "@/lib/strategy";
import { logActivity } from "./activity";
import type { SpaceContext } from "./tenancy";

const PERIOD_DAYS = 90;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Posts and numbers from the last 90 days, the same facts the audit uses. */
async function loadHistory(ctx: SpaceContext): Promise<History | null> {
  const tz = ctx.space.timezone;
  const startDay = addDays(zonedParts(new Date(ctx.requestTime), tz), -PERIOD_DAYS);
  const since = zonedToUtc(startDay.year, startDay.month, startDay.day, 0, 0, tz);
  return withOrg(ctx.org.id, async (tx) => {
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    if (!accounts.length) return null;
    const rows = await tx
      .select({ post: posts, platform: socialAccounts.platform })
      .from(posts)
      .innerJoin(socialAccounts, eq(socialAccounts.id, posts.socialAccountId))
      .where(and(eq(posts.spaceId, ctx.space.id), gte(posts.publishedAt, since)));
    const ids = rows.map((r) => r.post.id);
    const metrics = ids.length ? await tx.select().from(postMetrics).where(inArray(postMetrics.postId, ids)).orderBy(asc(postMetrics.takenAt)) : [];
    const latest = new Map(metrics.map((m) => [m.postId, m]));
    const facts: PostFact[] = rows.map(({ post, platform }) => {
      const m = latest.get(post.id);
      return { id: post.id, title: post.title, format: post.format, pillar: post.pillar, platform, publishedAt: post.publishedAt, reach: m?.reach ?? 0, views: m?.views ?? 0, likes: m?.likes ?? 0, comments: m?.comments ?? 0, saves: m?.saves ?? 0, shares: m?.shares ?? 0 };
    });
    const snapshots = await tx.select().from(accountMetricsDaily).where(inArray(accountMetricsDaily.socialAccountId, accounts.map((a) => a.id))).orderBy(desc(accountMetricsDaily.day));
    const followers = accounts.reduce((sum, a) => sum + (snapshots.find((s) => s.socialAccountId === a.id)?.followers ?? 0), 0);
    return summarizeHistory(facts, { periodDays: PERIOD_DAYS, timeZone: tz, followers });
  });
}

/** SG-01: the wizard starts filled in from Brand Brain, connected accounts and posting history. */
async function prefill(ctx: SpaceContext, history: History | null): Promise<StrategyInputs> {
  return withOrg(ctx.org.id, async (tx) => {
    const [brain] = await tx.select().from(brandBrains).where(eq(brandBrains.spaceId, ctx.space.id));
    const accounts = await tx.select({ platform: socialAccounts.platform }).from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    const platforms = [...new Set(accounts.map((a) => a.platform))].filter((p): p is Platform => ["instagram", "facebook", "linkedin"].includes(p));
    return {
      business: brain?.description ?? "",
      industry: "",
      audience: brain?.audience ?? "",
      location: "",
      offer: brain?.offers ?? "",
      objective: "awareness",
      platforms: platforms.length ? platforms : ["instagram"],
      postsPerWeek: Math.min(14, Math.max(3, Math.round(history?.perWeek ?? 3))),
      competitors: brain?.competitors ?? "",
      regions: ["north", "south", "east", "west"],
    };
  });
}

async function customMoments(ctx: SpaceContext): Promise<Moment[]> {
  const rows = await withOrg(ctx.org.id, (tx) => tx.select().from(spaceMoments).where(eq(spaceMoments.spaceId, ctx.space.id)).orderBy(asc(spaceMoments.date)));
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, region: "pan-india" as Region, kind: "custom" as const, note: r.note }));
}

export async function loadStrategyPage(ctx: SpaceContext) {
  const history = await loadHistory(ctx);
  const today = zonedParts(new Date(ctx.requestTime), ctx.space.timezone);
  const [data, custom] = await Promise.all([
    withOrg(ctx.org.id, async (tx) => {
      const [strategy] = await tx.select().from(strategies).where(eq(strategies.spaceId, ctx.space.id));
      const versions = strategy
        ? await tx.select().from(strategyVersions).where(eq(strategyVersions.strategyId, strategy.id)).orderBy(desc(strategyVersions.version))
        : [];
      const [plan] = await tx.select().from(contentPlans).where(eq(contentPlans.spaceId, ctx.space.id));
      const openIdeas = await tx
        .select({ id: ideas.id, title: ideas.title, pillar: ideas.pillar })
        .from(ideas)
        .where(and(eq(ideas.spaceId, ctx.space.id), isNull(ideas.contentItemId)))
        .orderBy(desc(ideas.createdAt));
      return { strategy, versions, plan, openIdeas };
    }),
    customMoments(ctx),
  ]);
  const inputs = data.strategy ? StrategyInputs.safeParse(data.strategy.inputs) : null;
  const resolvedInputs = inputs?.success ? inputs.data : await prefill(ctx, history);
  return {
    ...data,
    inputs: resolvedInputs,
    inputsSaved: Boolean(inputs?.success),
    history,
    custom,
    moments: upcomingMoments(today, 120, { regions: resolvedInputs.regions, custom }),
    today: isoDate(today),
  };
}

async function ensureStrategy(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [existing] = await tx.select().from(strategies).where(eq(strategies.spaceId, ctx.space.id));
    if (existing) return existing;
    const [created] = await tx.insert(strategies).values({ orgId: ctx.org.id, spaceId: ctx.space.id }).returning();
    return created;
  });
}

export async function saveInputs(ctx: SpaceContext, inputs: StrategyInputs) {
  const strategy = await ensureStrategy(ctx);
  await withOrg(ctx.org.id, (tx) => tx.update(strategies).set({ inputs, updatedAt: new Date() }).where(eq(strategies.id, strategy.id)));
}

/** Saves a new version and makes it current (SG-02: versioned). */
export async function addVersion(ctx: SpaceContext, doc: StrategyDoc, source: "starter" | "ai" | "edit" | "restore") {
  const strategy = await ensureStrategy(ctx);
  const clean = normalizeDoc(StrategyDoc.parse(doc));
  return withOrg(ctx.org.id, async (tx) => {
    const [{ top }] = await tx.select({ top: max(strategyVersions.version) }).from(strategyVersions).where(eq(strategyVersions.strategyId, strategy.id));
    const version = (top ?? 0) + 1;
    await tx.insert(strategyVersions).values({ orgId: ctx.org.id, strategyId: strategy.id, version, doc: clean, source, createdBy: ctx.user.id });
    await tx.update(strategies).set({ currentVersion: version, updatedAt: new Date() }).where(eq(strategies.id, strategy.id));
    return version;
  });
}

/** Everything AI (or the starter) needs to write a strategy. */
export async function strategyContext(ctx: SpaceContext) {
  const page = await loadStrategyPage(ctx);
  const [brain] = await withOrg(ctx.org.id, (tx) => tx.select().from(brandBrains).where(eq(brandBrains.spaceId, ctx.space.id)));
  return { ...page, brain: brain ?? null };
}

export function starterFor(ctx: SpaceContext, page: Awaited<ReturnType<typeof loadStrategyPage>>) {
  return starterStrategy(page.inputs, page.history, page.moments.slice(0, 8), ctx.space.name);
}

export async function restoreVersion(ctx: SpaceContext, version: number) {
  const strategy = await ensureStrategy(ctx);
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx.select().from(strategyVersions).where(and(eq(strategyVersions.strategyId, strategy.id), eq(strategyVersions.version, version))),
  );
  if (!row) throw new Error("That version doesn’t exist.");
  return addVersion(ctx, row.doc as StrategyDoc, "restore");
}

/** A read-only link to the current version (SG-02: shareable). Returns the token once; only its hash is stored. */
export async function shareStrategy(ctx: SpaceContext) {
  const strategy = await ensureStrategy(ctx);
  if (!strategy.currentVersion) throw new Error("Create the strategy before sharing it.");
  const token = randomBytes(24).toString("base64url");
  await withOrg(ctx.org.id, (tx) => tx.update(strategies).set({ shareTokenHash: hash(token), sharedAt: new Date() }).where(eq(strategies.id, strategy.id)));
  return token;
}

export async function unshareStrategy(ctx: SpaceContext) {
  await withOrg(ctx.org.id, (tx) => tx.update(strategies).set({ shareTokenHash: null, sharedAt: null }).where(eq(strategies.spaceId, ctx.space.id)));
}

/** The shared page: the only read without a signed-in member, found by the token's hash. */
export async function loadSharedStrategy(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getSystemDb();
  const [row] = await db
    .select({ strategy: strategies, space: spaces, orgName: organizations.name, brandColor: organizations.brandColor })
    .from(strategies)
    .innerJoin(spaces, eq(spaces.id, strategies.spaceId))
    .innerJoin(organizations, eq(organizations.id, strategies.orgId))
    .where(eq(strategies.shareTokenHash, hash(token)));
  if (!row) return null;
  const [version] = await db
    .select()
    .from(strategyVersions)
    .where(and(eq(strategyVersions.strategyId, row.strategy.id), eq(strategyVersions.version, row.strategy.currentVersion)));
  if (!version) return null;
  return { doc: version.doc as StrategyDoc, version: version.version, updatedAt: version.createdAt, spaceName: row.space.name, orgName: row.orgName, brandColor: row.brandColor };
}

/* ---------- 30-day planner (SG-03) ---------- */

export async function currentDoc(ctx: SpaceContext): Promise<StrategyDoc | null> {
  const strategy = await ensureStrategy(ctx);
  if (!strategy.currentVersion) return null;
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx.select().from(strategyVersions).where(and(eq(strategyVersions.strategyId, strategy.id), eq(strategyVersions.version, strategy.currentVersion))),
  );
  return (row?.doc as StrategyDoc) ?? null;
}

export async function savePlan(ctx: SpaceContext, rows: PlanRow[], source: string, startsOn: string) {
  const clean = rows.map((r) => PlanRow.parse(r)).slice(0, 80);
  await withOrg(ctx.org.id, (tx) =>
    tx
      .insert(contentPlans)
      .values({ orgId: ctx.org.id, spaceId: ctx.space.id, rows: clean, source, startsOn, createdBy: ctx.user.id })
      .onConflictDoUpdate({ target: contentPlans.spaceId, set: { rows: clean, source, startsOn, updatedAt: new Date() } }),
  );
}

export function starterPlan(ctx: SpaceContext, page: Awaited<ReturnType<typeof loadStrategyPage>>, doc: StrategyDoc) {
  const start = addDays(zonedParts(new Date(ctx.requestTime), ctx.space.timezone), 1);
  return {
    start: isoDate(start),
    rows: planDays({ start, days: 30, doc, objective: page.inputs.objective, history: page.history, moments: page.moments, ideas: page.openIdeas, industry: page.inputs.industry }),
  };
}

/**
 * "Add to calendar" (SG-03): the chosen rows become drafts in the first Not started status,
 * with their date, placement, pillar and a caption from the hook and CTA. Ideas used are
 * marked as turned into posts.
 */
export async function addPlanToCalendar(ctx: SpaceContext, rowIds: string[]) {
  return withOrg(ctx.org.id, async (tx) => {
    const [plan] = await tx.select().from(contentPlans).where(eq(contentPlans.spaceId, ctx.space.id));
    if (!plan) throw new Error("There’s no plan to add yet.");
    const rows = (plan.rows as PlanRow[]).filter((r) => rowIds.includes(r.id));
    if (!rows.length) throw new Error("Choose at least one row.");
    const [first] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.category, "not_started"), eq(statuses.appliesTo, "content")))
      .orderBy(asc(statuses.position))
      .limit(1);
    if (!first) throw new Error("This space has no “Not started” status for drafts.");
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    const [{ top }] = await tx.select({ top: max(contentItems.position) }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id));
    let n = 0;
    for (const r of rows) {
      const [y, m, d] = r.date.split("-").map(Number);
      const [hh, mm] = r.time.split(":").map(Number);
      const [item] = await tx
        .insert(contentItems)
        .values({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          title: r.topic || `${r.pillar} post`,
          statusId: first.id,
          pillar: r.pillar || null,
          caption: [r.hook, r.cta].filter(Boolean).join("\n\n"),
          scheduledAt: zonedToUtc(y, m, d, hh, mm, ctx.space.timezone),
          position: (top ?? 0) + ++n,
          createdBy: ctx.user.id,
          autopost: ctx.space.autopostNewContent,
        })
        .returning();
      await tx.insert(placements).values({
        orgId: ctx.org.id,
        contentItemId: item.id,
        kind: r.format,
        socialAccountId: accounts.find((a) => a.platform === PLACEMENTS[r.format].platform && a.status !== "disconnected")?.id ?? null,
      });
      await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: item.id, actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name }, action: "created from the 30-day plan" });
      if (r.ideaId && /^[0-9a-f-]{36}$/.test(r.ideaId)) {
        await tx.update(ideas).set({ contentItemId: item.id }).where(and(eq(ideas.id, r.ideaId), eq(ideas.spaceId, ctx.space.id), isNull(ideas.contentItemId)));
      }
    }
    // Added rows leave the plan; the rest stay for later.
    const left = (plan.rows as PlanRow[]).filter((r) => !rowIds.includes(r.id));
    await tx.update(contentPlans).set({ rows: left, updatedAt: new Date() }).where(eq(contentPlans.id, plan.id));
    return n;
  });
}

/* ---------- Custom dates (SG-04) ---------- */

export async function addMoment(ctx: SpaceContext, input: { name: string; date: string; note: string }) {
  await withOrg(ctx.org.id, (tx) => tx.insert(spaceMoments).values({ orgId: ctx.org.id, spaceId: ctx.space.id, name: input.name, date: input.date, note: input.note, createdBy: ctx.user.id }));
}

export async function deleteMoment(ctx: SpaceContext, id: string) {
  await withOrg(ctx.org.id, (tx) => tx.delete(spaceMoments).where(and(eq(spaceMoments.id, id), eq(spaceMoments.spaceId, ctx.space.id))));
}

/** "Add as campaign idea": the moment goes to the Idea Bank as a Trend idea. */
export async function momentToIdea(ctx: SpaceContext, moment: { name: string; date: string; idea?: string }) {
  await withOrg(ctx.org.id, (tx) =>
    tx.insert(ideas).values({
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      title: `${moment.name} campaign`,
      notes: [moment.idea, `Date: ${moment.date}`].filter(Boolean).join("\n"),
      source: "trend",
      tags: ["festival"],
      createdBy: ctx.user.id,
    }),
  );
}

/** Festivals and the space's own dates in a date range, for calendar markers (SG-04). */
export async function momentsForRange(ctx: SpaceContext, from: string, days: number) {
  const [strategy] = await withOrg(ctx.org.id, (tx) => tx.select({ inputs: strategies.inputs }).from(strategies).where(eq(strategies.spaceId, ctx.space.id)));
  const parsed = strategy ? StrategyInputs.safeParse(strategy.inputs) : null;
  const custom = await customMoments(ctx);
  const [y, m, d] = from.split("-").map(Number);
  return upcomingMoments({ year: y, month: m, day: d }, days, { regions: parsed?.success ? parsed.data.regions : undefined, custom });
}
