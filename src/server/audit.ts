import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { withOrg } from "@/db";
import { accountMetricsDaily, contentItems, insights, postMetrics, posts, socialAccounts } from "@/db/schema";
import { computeAudit, type PostFact } from "@/lib/analytics/audit";
import { addDays, zonedParts, zonedToUtc } from "@/lib/analytics/time";
import type { Platform } from "@/lib/placements";
import type { SpaceContext } from "./tenancy";

const PERIOD_DAYS = 90;

export async function getSpaceAudit(ctx: SpaceContext, now = new Date()) {
  const tz = ctx.space.timezone;
  const startDay = addDays(zonedParts(now, tz), -PERIOD_DAYS);
  const since = zonedToUtc(startDay.year, startDay.month, startDay.day, 0, 0, tz);

  return withOrg(ctx.org.id, async (tx) => {
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    if (accounts.length === 0) return { state: "no-accounts" as const };

    const rows = await tx
      .select({ post: posts, platform: socialAccounts.platform })
      .from(posts)
      .innerJoin(socialAccounts, eq(socialAccounts.id, posts.socialAccountId))
      .where(and(eq(posts.spaceId, ctx.space.id), gte(posts.publishedAt, since)));
    const ids = rows.map((r) => r.post.id);
    const metrics = ids.length ? await tx.select().from(postMetrics).where(inArray(postMetrics.postId, ids)) : [];
    const latest = new Map<string, (typeof metrics)[number]>();
    for (const m of metrics) {
      const prev = latest.get(m.postId);
      if (!prev || prev.takenAt < m.takenAt) latest.set(m.postId, m);
    }

    const facts: PostFact[] = rows.map(({ post, platform }) => {
      const m = latest.get(post.id);
      return {
        id: post.id,
        title: post.title,
        format: post.format,
        pillar: post.pillar,
        platform,
        publishedAt: post.publishedAt,
        reach: m?.reach ?? 0,
        views: m?.views ?? 0,
        likes: m?.likes ?? 0,
        comments: m?.comments ?? 0,
        saves: m?.saves ?? 0,
        shares: m?.shares ?? 0,
      };
    });

    // Current followers: the latest daily snapshot of each account.
    const snapshots = await tx
      .select()
      .from(accountMetricsDaily)
      .where(inArray(accountMetricsDaily.socialAccountId, accounts.map((a) => a.id)));
    const followers = accounts.reduce((sum, a) => {
      const mine = snapshots.filter((x) => x.socialAccountId === a.id).sort((x, y) => y.day.localeCompare(x.day));
      return sum + (mine[0]?.followers ?? 0);
    }, 0);

    const platforms = [...new Set(accounts.map((a) => a.platform))] as Platform[];
    const audit = computeAudit(facts, { followers, periodDays: PERIOD_DAYS, now, timeZone: tz, platforms });

    // Plan rows already on the calendar (same title and time) are not offered again.
    const planTimes = audit.plan.map((p) => new Date(p.scheduledAt));
    const existing = planTimes.length
      ? await tx
          .select({ title: contentItems.title, scheduledAt: contentItems.scheduledAt })
          .from(contentItems)
          .where(and(eq(contentItems.spaceId, ctx.space.id), inArray(contentItems.scheduledAt, planTimes)))
      : [];
    const onCalendar = audit.plan
      .filter((p) => existing.some((e) => e.title === p.title && e.scheduledAt?.toISOString() === p.scheduledAt))
      .map((p) => p.key);

    const saved = await tx.select({ key: insights.key }).from(insights).where(eq(insights.spaceId, ctx.space.id));

    return {
      state: "ready" as const,
      audit,
      since: since.toISOString(),
      until: now.toISOString(),
      isDemo: accounts.some((a) => a.isDemo),
      accounts: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        posts: facts.filter((f) => rows.find((r) => r.post.id === f.id)?.post.socialAccountId === a.id).length,
      })),
      onCalendar,
      addedToPlan: saved.map((s) => s.key),
    };
  });
}

export type SpaceAudit = Awaited<ReturnType<typeof getSpaceAudit>>;
