// Settings › Integrations › Calendar feed: a private iCalendar link with the posts (and tasks)
// planned in every space the person can see. Calendar apps fetch it on their own schedule.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { calendarFeeds, contentItems, memberships, organizations, placements, spaceMembers, spaces, statuses, tasks } from "@/db/schema";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import type { OrgContext } from "@/server/tenancy";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function feedStatus(ctx: OrgContext) {
  const [row] = await withOrg(ctx.org.id, (tx) => tx.select().from(calendarFeeds).where(eq(calendarFeeds.userId, ctx.user.id)));
  return row ? { includeTasks: row.includeTasks, lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() } : null;
}

/** A new link (any old one stops working). Returns the token, shown once. */
export async function createFeed(ctx: OrgContext, includeTasks: boolean) {
  const token = randomBytes(24).toString("base64url");
  await withOrg(ctx.org.id, async (tx) => {
    await tx.delete(calendarFeeds).where(eq(calendarFeeds.userId, ctx.user.id));
    await tx.insert(calendarFeeds).values({ orgId: ctx.org.id, userId: ctx.user.id, tokenHash: hash(token), includeTasks });
  });
  return token;
}

export async function setFeedTasks(ctx: OrgContext, includeTasks: boolean) {
  await withOrg(ctx.org.id, (tx) => tx.update(calendarFeeds).set({ includeTasks }).where(eq(calendarFeeds.userId, ctx.user.id)));
}

export async function removeFeed(ctx: OrgContext) {
  await withOrg(ctx.org.id, (tx) => tx.delete(calendarFeeds).where(eq(calendarFeeds.userId, ctx.user.id)));
}

/**
 * The feed for a token, or null when it's unknown or the person has left the organisation.
 * Spaces are checked on every fetch, so someone taken out of a space stops seeing it.
 */
export async function renderFeed(token: string, appUrl: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getSystemDb();
  const [feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.tokenHash, hash(token)));
  if (!feed) return null;
  return withOrg(feed.orgId, async (tx) => {
    const [[member], [org]] = await Promise.all([
      tx.select().from(memberships).where(eq(memberships.userId, feed.userId)),
      tx.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, feed.orgId)),
    ]);
    if (!member || !org) return null;
    const active = await tx.select().from(spaces).where(and(isNull(spaces.archivedAt), isNull(spaces.deletedAt)));
    const everything = member.role === "owner" || member.role === "admin";
    const added = everything ? null : new Set((await tx.select({ spaceId: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, feed.userId))).map((r) => r.spaceId));
    const allowed = added ? active.filter((sp) => added.has(sp.id)) : active;
    const ids = allowed.map((s) => s.id);
    const bySpace = new Map(allowed.map((s) => [s.id, s]));
    const from = new Date(now.getTime() - 60 * 864e5);
    const until = new Date(now.getTime() + 180 * 864e5);
    const events: IcsEvent[] = [];
    if (ids.length) {
      const posts = await tx
        .select({ item: contentItems, status: statuses.name })
        .from(contentItems)
        .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
        .where(and(inArray(contentItems.spaceId, ids), isNull(contentItems.archivedAt), isNotNull(contentItems.scheduledAt), gte(contentItems.scheduledAt, from), lte(contentItems.scheduledAt, until)));
      const kinds = posts.length ? await tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, posts.map((p) => p.item.id))) : [];
      for (const { item, status } of posts) {
        const sp = bySpace.get(item.spaceId)!;
        const where = kinds.filter((k) => k.contentItemId === item.id).map((k) => PLACEMENTS[k.kind as PlacementKind].short);
        const url = `${appUrl}/o/${org.slug}/s/${sp.slug}/calendar?content=${item.id}`;
        events.push({
          uid: `post-${item.id}@plotline`,
          start: item.scheduledAt!,
          minutes: 30,
          summary: `[${sp.name}] ${item.title}${where.length ? ` (${where.join(", ")})` : ""}`,
          description: [`Status: ${status}`, `Publishing: ${item.publishState.replace("_", " ")}`, item.caption ? `\n${item.caption.slice(0, 500)}` : "", `\nOpen in Plotline: ${url}`].filter(Boolean).join("\n"),
          url,
          updated: item.updatedAt,
        });
      }
      if (feed.includeTasks) {
        const due = await tx
          .select()
          .from(tasks)
          .where(and(inArray(tasks.spaceId, ids), eq(tasks.done, false), isNotNull(tasks.dueAt), gte(tasks.dueAt, from), lte(tasks.dueAt, until)));
        for (const t of due) {
          const sp = bySpace.get(t.spaceId)!;
          const url = `${appUrl}/o/${org.slug}/s/${sp.slug}/board?view=tasks&task=${t.id}`;
          events.push({ uid: `task-${t.id}@plotline`, start: t.dueAt!, minutes: 15, summary: `[${sp.name}] Task due: ${t.title}`, description: `Open in Plotline: ${url}`, url, updated: t.updatedAt });
        }
      }
    }
    await tx.update(calendarFeeds).set({ lastFetchedAt: now }).where(eq(calendarFeeds.id, feed.id));
    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    return buildCalendar(`Plotline · ${org.name}`, events, now);
  });
}
