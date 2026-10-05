import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { withOrg } from "@/db";
import { attachMedia } from "@/db/media";
import { contentItems, ideas, mediaAssets, posts, statuses } from "@/db/schema";
import { cleanLinks, pillarNames, type IdeaSource } from "@/lib/ideas";
import { cleanTags } from "@/lib/table";
import { logActivity } from "./activity";
import type { SpaceContext } from "./tenancy";

export interface IdeaInput {
  title?: string;
  notes?: string;
  source?: IdeaSource;
  pillar?: string | null;
  tags?: string[];
  links?: { url: string; title?: string }[];
  mediaIds?: string[];
}

export async function listIdeas(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx.select().from(ideas).where(eq(ideas.spaceId, ctx.space.id)).orderBy(desc(ideas.createdAt));
    const linked = rows.map((r) => r.contentItemId).filter((x): x is string => Boolean(x));
    const titles = linked.length ? await tx.select({ id: contentItems.id, title: contentItems.title }).from(contentItems).where(inArray(contentItems.id, linked)) : [];
    const [pillarsUsed, postPillars] = await Promise.all([
      tx.select({ pillar: contentItems.pillar }).from(contentItems).where(and(eq(contentItems.spaceId, ctx.space.id), isNotNull(contentItems.pillar))),
      tx.select({ pillar: posts.pillar }).from(posts).where(and(eq(posts.spaceId, ctx.space.id), isNotNull(posts.pillar))),
    ]);
    const library = await tx
      .select({ id: mediaAssets.id, filename: mediaAssets.filename, thumb: mediaAssets.thumbKey })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.spaceId, ctx.space.id), eq(mediaAssets.type, "image"), eq(mediaAssets.status, "ready")))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(120);
    return {
      ideas: rows.map((r) => ({
        id: r.id,
        title: r.title,
        notes: r.notes,
        source: r.source,
        pillar: r.pillar,
        tags: r.tags,
        links: r.links,
        mediaIds: r.mediaIds,
        contentItemId: r.contentItemId,
        contentTitle: titles.find((t) => t.id === r.contentItemId)?.title ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      // Pillars already in use across ideas, posts and published history, for suggestions.
      pillars: pillarNames([...rows.map((r) => r.pillar), ...pillarsUsed.map((p) => p.pillar), ...postPillars.map((p) => p.pillar)]),
      library: library.filter((l) => l.thumb).map((l) => ({ id: l.id, filename: l.filename })),
    };
  });
}

export type IdeaList = Awaited<ReturnType<typeof listIdeas>>;

async function cleanInput(ctx: SpaceContext, input: IdeaInput) {
  const out: Partial<typeof ideas.$inferInsert> = {};
  if (input.title !== undefined) {
    const t = input.title.trim().slice(0, 200);
    if (!t) throw new Error("An idea needs a title.");
    out.title = t;
  }
  if (input.notes !== undefined) out.notes = input.notes.slice(0, 5000);
  if (input.source !== undefined) out.source = input.source;
  if (input.pillar !== undefined) out.pillar = input.pillar?.trim().slice(0, 60) || null;
  if (input.tags !== undefined) out.tags = cleanTags(input.tags);
  if (input.links !== undefined) out.links = cleanLinks(input.links);
  if (input.mediaIds !== undefined) {
    const wanted = [...new Set(input.mediaIds)].slice(0, 8);
    const found = wanted.length
      ? await withOrg(ctx.org.id, (tx) => tx.select({ id: mediaAssets.id }).from(mediaAssets).where(and(inArray(mediaAssets.id, wanted), eq(mediaAssets.spaceId, ctx.space.id))))
      : [];
    out.mediaIds = wanted.filter((id) => found.some((f) => f.id === id));
  }
  return out;
}

export async function createIdeas(ctx: SpaceContext, list: IdeaInput[]) {
  const values: (typeof ideas.$inferInsert)[] = [];
  for (const input of list) {
    const clean = await cleanInput(ctx, { source: "me", ...input, title: input.title ?? "" });
    values.push({ ...clean, title: clean.title!, orgId: ctx.org.id, spaceId: ctx.space.id, createdBy: ctx.user.id });
  }
  return withOrg(ctx.org.id, (tx) => tx.insert(ideas).values(values).returning({ id: ideas.id }));
}

export async function updateIdea(ctx: SpaceContext, id: string, input: IdeaInput) {
  const patch = await cleanInput(ctx, input);
  const updated = await withOrg(ctx.org.id, (tx) =>
    tx
      .update(ideas)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(ideas.id, id), eq(ideas.spaceId, ctx.space.id)))
      .returning({ id: ideas.id }),
  );
  if (!updated.length) throw new Error("That idea was deleted.");
}

export async function deleteIdeas(ctx: SpaceContext, ids: string[]) {
  await withOrg(ctx.org.id, (tx) => tx.delete(ideas).where(and(inArray(ideas.id, ids), eq(ideas.spaceId, ctx.space.id))));
}

/** "Turn into content" (VW-07): a draft post in the first Not started status, with the idea's pillar, tags and images. */
export async function turnIntoContent(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, id), eq(ideas.spaceId, ctx.space.id)));
    if (!idea) throw new Error("That idea was deleted.");
    if (idea.contentItemId) return idea.contentItemId;
    const [first] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.category, "not_started"), eq(statuses.appliesTo, "content")))
      .orderBy(asc(statuses.position))
      .limit(1);
    if (!first) throw new Error("This space has no “Not started” status for drafts.");
    const [{ top }] = await tx.select({ top: max(contentItems.position) }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id));
    const references = idea.links.map((l) => `${l.title ? `${l.title}: ` : ""}${l.url}`).join("\n");
    const [item] = await tx
      .insert(contentItems)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        title: idea.title,
        statusId: first.id,
        pillar: idea.pillar,
        tags: idea.tags,
        caption: [idea.notes.trim(), references ? `References:\n${references}` : ""].filter(Boolean).join("\n\n"),
        position: (top ?? 0) + 1,
        createdBy: ctx.user.id,
        autopost: ctx.space.autopostNewContent,
      })
      .returning();
    if (idea.mediaIds.length) await attachMedia(tx, ctx.org.id, item.id, idea.mediaIds);
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
      action: "created from the Idea Bank",
    });
    await tx.update(ideas).set({ contentItemId: item.id, updatedAt: new Date() }).where(eq(ideas.id, idea.id));
    return item.id;
  });
}

/** Applies pillar suggestions the person approved (and possibly edited). */
export async function applyPillars(ctx: SpaceContext, assignments: { id: string; pillar: string }[]) {
  await withOrg(ctx.org.id, async (tx) => {
    for (const a of assignments) {
      const pillar = a.pillar.trim().slice(0, 60);
      if (!pillar) continue;
      await tx
        .update(ideas)
        .set({ pillar, updatedAt: new Date() })
        .where(and(eq(ideas.id, a.id), eq(ideas.spaceId, ctx.space.id)));
    }
  });
}
