// Whole-post operations from the post window's menu: duplicate, repurpose into one post per
// platform placement, and a share link for chosen posts (PRD CT-12, SH-02).
import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentAssignees, contentItems, contentMedia, placements, shareLinkItems, shareLinks } from "@/db/schema";
import { logActivity } from "@/server/activity";
import type { SpaceContext } from "@/server/tenancy";

const actorOf = (ctx: SpaceContext) => ({ kind: "user" as const, userId: ctx.user.id, name: ctx.user.name });

async function load(tx: Tx, ctx: SpaceContext, id: string) {
  const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.spaceId, ctx.space.id)));
  if (!item) throw new Error("That post isn’t in this space any more.");
  return item;
}

/** Copies a post as a new draft: text, tags, project, assignees, media and platforms, without dates or results. */
export async function duplicateContent(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const item = await load(tx, ctx, id);
    const [copy] = await tx
      .insert(contentItems)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        projectId: item.projectId,
        title: `${item.title} (copy)`.slice(0, 200),
        statusId: item.statusId,
        pillar: item.pillar,
        tags: item.tags,
        caption: item.caption,
        hashtags: item.hashtags,
        firstComment: item.firstComment,
        position: item.position + 0.5,
        createdBy: ctx.user.id,
      })
      .returning();
    const [pl, asg, media] = await Promise.all([
      tx.select().from(placements).where(eq(placements.contentItemId, id)),
      tx.select().from(contentAssignees).where(eq(contentAssignees.contentItemId, id)),
      tx.select().from(contentMedia).where(eq(contentMedia.contentItemId, id)),
    ]);
    if (pl.length)
      await tx.insert(placements).values(pl.map((p) => ({ orgId: ctx.org.id, contentItemId: copy.id, kind: p.kind, socialAccountId: p.socialAccountId, captionOverride: p.captionOverride, options: p.options })));
    if (asg.length) await tx.insert(contentAssignees).values(asg.map((a) => ({ orgId: ctx.org.id, contentItemId: copy.id, userId: a.userId })));
    if (media.length) await tx.insert(contentMedia).values(media.map((m) => ({ orgId: ctx.org.id, contentItemId: copy.id, mediaAssetId: m.mediaAssetId, position: m.position })));
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: copy.id, actor: actorOf(ctx), action: `duplicated from “${item.title}”` });
    return copy;
  });
}

/**
 * Splits a post with several placements into one post per placement, linked as a group. Each
 * keeps the date, status, assignees and media; a platform's own caption becomes that post's caption.
 */
export async function repurposeContent(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const item = await load(tx, ctx, id);
    if (["scheduled", "publishing", "published", "partially_published"].includes(item.publishState))
      throw new Error(item.publishState === "scheduled" ? "Unschedule it first, then repurpose." : "Published posts can’t be repurposed.");
    const pl = await tx.select().from(placements).where(eq(placements.contentItemId, id)).orderBy(asc(placements.createdAt));
    if (pl.length < 2) throw new Error("Add at least two platforms to repurpose it into separate posts.");
    const [asg, media] = await Promise.all([
      tx.select().from(contentAssignees).where(eq(contentAssignees.contentItemId, id)),
      tx.select().from(contentMedia).where(eq(contentMedia.contentItemId, id)),
    ]);
    const groupId = item.groupId ?? item.id;
    await tx.update(contentItems).set({ groupId, updatedAt: new Date() }).where(eq(contentItems.id, id));
    const created: string[] = [];
    // The first placement stays on this post; each of the others moves to a new post.
    for (const [i, p] of pl.slice(1).entries()) {
      const [post] = await tx
        .insert(contentItems)
        .values({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          projectId: item.projectId,
          title: item.title,
          statusId: item.statusId,
          pillar: item.pillar,
          tags: item.tags,
          scheduledAt: item.scheduledAt,
          autopost: item.autopost,
          caption: p.captionOverride ?? item.caption,
          hashtags: item.hashtags,
          firstComment: item.firstComment,
          groupId,
          position: item.position + (i + 1) / 100,
          createdBy: ctx.user.id,
        })
        .returning();
      await tx.update(placements).set({ contentItemId: post.id, captionOverride: null }).where(eq(placements.id, p.id));
      if (asg.length) await tx.insert(contentAssignees).values(asg.map((a) => ({ orgId: ctx.org.id, contentItemId: post.id, userId: a.userId })));
      if (media.length) await tx.insert(contentMedia).values(media.map((m) => ({ orgId: ctx.org.id, contentItemId: post.id, mediaAssetId: m.mediaAssetId, position: m.position })));
      await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: post.id, actor: actorOf(ctx), action: `repurposed from “${item.title}”` });
      created.push(post.id);
    }
    // The kept placement's own caption becomes this post's caption.
    if (pl[0].captionOverride !== null) {
      await tx.update(contentItems).set({ caption: pl[0].captionOverride }).where(eq(contentItems.id, id));
      await tx.update(placements).set({ captionOverride: null }).where(eq(placements.id, pl[0].id));
    }
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: id, actor: actorOf(ctx), action: `repurposed into ${pl.length} posts` });
    return { groupId, created };
  });
}

/** The other posts in this post's repurposed group, with their placements. */
export async function groupSiblings(tx: Tx, item: { id: string; groupId: string | null }) {
  if (!item.groupId) return [];
  const rows = await tx
    .select({ id: contentItems.id, title: contentItems.title, kind: placements.kind })
    .from(contentItems)
    .leftJoin(placements, eq(placements.contentItemId, contentItems.id))
    .where(and(eq(contentItems.groupId, item.groupId), isNull(contentItems.archivedAt)))
    .orderBy(asc(contentItems.position), asc(contentItems.createdAt));
  const byId = new Map<string, { id: string; title: string; kinds: string[]; current: boolean }>();
  for (const r of rows) {
    const entry = byId.get(r.id) ?? { id: r.id, title: r.title, kinds: [], current: r.id === item.id };
    if (r.kind) entry.kinds.push(r.kind);
    byId.set(r.id, entry);
  }
  return [...byId.values()];
}

/** A link for chosen posts: view, comment or approve, with an optional expiry (SH-02). */
export async function shareContent(ctx: SpaceContext, ids: string[], opts: { permission: "view" | "comment" | "approve"; expiresInDays: number | null }) {
  return withOrg(ctx.org.id, async (tx) => {
    const items = await tx
      .select({ id: contentItems.id, title: contentItems.title })
      .from(contentItems)
      .where(and(inArray(contentItems.id, ids), eq(contentItems.spaceId, ctx.space.id), isNull(contentItems.archivedAt)));
    if (items.length === 0) throw new Error("Choose at least one post to share.");
    const order = new Map(ids.map((x, i) => [x, i]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const token = randomBytes(24).toString("base64url");
    const [link] = await tx
      .insert(shareLinks)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        token,
        title: items.length === 1 ? items[0].title : `${ctx.space.name}: ${items.length} posts`,
        permission: opts.permission,
        expiresAt: opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 864e5) : null,
        createdBy: ctx.user.id,
      })
      .returning();
    await tx.insert(shareLinkItems).values(items.map((it, position) => ({ orgId: ctx.org.id, shareLinkId: link.id, contentItemId: it.id, position })));
    for (const it of items)
      await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: it.id, actor: actorOf(ctx), action: opts.permission === "approve" ? "shared for review" : "shared a link" });
    return { token, count: items.length };
  });
}

/** Live links that include this post, newest first, so the share window can show and revoke them. */
export async function linksForContent(tx: Tx, contentId: string, now: Date) {
  const rows = await tx
    .select({ id: shareLinks.id, token: shareLinks.token, permission: shareLinks.permission, expiresAt: shareLinks.expiresAt, createdAt: shareLinks.createdAt })
    .from(shareLinkItems)
    .innerJoin(shareLinks, eq(shareLinks.id, shareLinkItems.shareLinkId))
    .where(and(eq(shareLinkItems.contentItemId, contentId), isNull(shareLinks.revokedAt)))
    .orderBy(asc(shareLinks.createdAt));
  return rows.filter((r) => !r.expiresAt || r.expiresAt > now).reverse();
}

export async function revokeLink(ctx: SpaceContext, linkId: string) {
  await withOrg(ctx.org.id, (tx) => tx.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.id, linkId), eq(shareLinks.spaceId, ctx.space.id))));
}

/** What the post window's pickers and menus need beyond the post itself. */
export async function panelExtras(ctx: SpaceContext, item: { id: string; groupId: string | null }) {
  const { assignableMembers } = await import("@/server/table");
  const { orgTags, projects } = await import("@/db/schema");
  return withOrg(ctx.org.id, async (tx) => {
    const [siblings, projectList, members, links, listed, used] = await Promise.all([
      groupSiblings(tx, item),
      tx.select({ id: projects.id, name: projects.name, color: projects.color }).from(projects).where(and(eq(projects.spaceId, ctx.space.id), isNull(projects.archivedAt))).orderBy(asc(projects.name)),
      assignableMembers(tx, ctx),
      linksForContent(tx, item.id, new Date(ctx.requestTime)),
      tx.select({ name: orgTags.name }).from(orgTags),
      tx.select({ tags: contentItems.tags }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id)),
    ]);
    const tagOptions = [...new Set([...listed.map((t) => t.name), ...used.flatMap((r) => r.tags)])].sort((a, b) => a.localeCompare(b));
    return { siblings, projects: projectList, members, links, tagOptions };
  });
}

export type PanelExtras = Awaited<ReturnType<typeof panelExtras>>;
