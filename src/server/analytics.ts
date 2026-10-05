import "server-only";
import { eq, inArray } from "drizzle-orm";
import { withOrg } from "@/db";
import { accountMetricsDaily, insights, postMetrics, posts, socialAccounts } from "@/db/schema";
import { computeReport, type RangeDays, type ReportPost } from "@/lib/analytics/report";
import type { Platform } from "@/lib/placements";
import type { SpaceContext } from "./tenancy";

export const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export async function getSpaceAnalytics(ctx: SpaceContext, opts: { days: RangeDays; platform: Platform | "all" }, now = new Date()) {
  return withOrg(ctx.org.id, async (tx) => {
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    if (accounts.length === 0) return { state: "no-accounts" as const };

    // All of the space's posts: the report picks the period and the one before it.
    const rows = await tx.select().from(posts).where(eq(posts.spaceId, ctx.space.id));
    const metrics = rows.length ? await tx.select().from(postMetrics).where(inArray(postMetrics.postId, rows.map((r) => r.id))) : [];
    const latest = new Map<string, (typeof metrics)[number]>();
    for (const m of metrics) {
      const prev = latest.get(m.postId);
      if (!prev || prev.takenAt < m.takenAt) latest.set(m.postId, m);
    }
    const platformOf = new Map(accounts.map((a) => [a.id, a.platform]));
    const reportPosts: ReportPost[] = rows.map((p) => {
      const m = latest.get(p.id);
      return {
        id: p.id,
        accountId: p.socialAccountId,
        title: p.title,
        format: p.format,
        pillar: p.pillar,
        topic: p.topic,
        hookType: p.hookType,
        platform: platformOf.get(p.socialAccountId)!,
        publishedAt: p.publishedAt,
        reach: m?.reach ?? 0,
        views: m?.views ?? 0,
        likes: m?.likes ?? 0,
        comments: m?.comments ?? 0,
        saves: m?.saves ?? 0,
        shares: m?.shares ?? 0,
      };
    });
    const snapshots = await tx
      .select()
      .from(accountMetricsDaily)
      .where(inArray(accountMetricsDaily.socialAccountId, accounts.map((a) => a.id)));
    const saved = await tx.select({ key: insights.key }).from(insights).where(eq(insights.spaceId, ctx.space.id));

    const report = computeReport({
      posts: reportPosts,
      snapshots: snapshots.map((s) => ({ accountId: s.socialAccountId, day: s.day, followers: s.followers })),
      accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle })),
      days: opts.days,
      platform: opts.platform,
      now,
      timeZone: ctx.space.timezone,
    });

    const lastSync = [...metrics.map((m) => m.takenAt.getTime()), ctx.space.metricsRefreshedAt?.getTime() ?? 0];
    return {
      state: "ready" as const,
      report,
      isDemo: accounts.some((a) => a.isDemo),
      updatedAt: lastSync.length ? new Date(Math.max(...lastSync)).toISOString() : null,
      refreshAvailableAt: ctx.space.metricsRefreshedAt
        ? new Date(ctx.space.metricsRefreshedAt.getTime() + REFRESH_INTERVAL_MS).toISOString()
        : null,
      addedToPlan: saved.map((s) => s.key),
    };
  });
}
