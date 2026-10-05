import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./core";
import { generateDemoHistory } from "./demo-history";
import * as s from "./schema";

/**
 * Adds sample post history to the demo Cafe space when it has none, including on
 * databases created before post history existed. Marks those accounts as demo.
 */
export async function seedDemoHistoryIfMissing(db: Db, now = new Date()): Promise<boolean> {
  const [cafe] = await db
    .select({ space: s.spaces })
    .from(s.spaces)
    .innerJoin(s.organizations, eq(s.organizations.id, s.spaces.orgId))
    .where(and(eq(s.organizations.slug, "knockknockclub"), eq(s.spaces.slug, "cafe")));
  if (!cafe) return false;
  const { space } = cafe;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.posts).where(eq(s.posts.spaceId, space.id));
  if (count > 0) return false;

  const accounts = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.spaceId, space.id));
  const byPlatform = Object.fromEntries(accounts.map((a) => [a.platform, a]));
  if (!byPlatform.instagram || !byPlatform.facebook) return false;

  const history = generateDemoHistory(now, space.timezone);
  await db.transaction(async (tx) => {
    await tx.update(s.socialAccounts).set({ isDemo: true }).where(eq(s.socialAccounts.spaceId, space.id));
    for (const p of history.posts) {
      const [post] = await tx
        .insert(s.posts)
        .values({
          orgId: space.orgId,
          spaceId: space.id,
          socialAccountId: byPlatform[p.platform].id,
          externalId: p.externalId,
          publishedAt: p.publishedAt,
          format: p.format,
          title: p.title,
          caption: p.title,
          pillar: p.pillar,
        })
        .returning();
      await tx.insert(s.postMetrics).values({
        orgId: space.orgId,
        postId: post.id,
        takenAt: new Date(Math.min(now.getTime(), p.publishedAt.getTime() + 30 * 864e5)),
        reach: p.reach,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        saves: p.saves,
        shares: p.shares,
      });
    }
    for (const platform of ["instagram", "facebook"] as const) {
      await tx.insert(s.accountMetricsDaily).values(
        history.followers[platform].map((f) => ({ orgId: space.orgId, socialAccountId: byPlatform[platform].id, day: f.day, followers: f.followers })),
      );
    }
  });
  return true;
}
