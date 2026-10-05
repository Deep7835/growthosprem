"use server";

import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withOrg } from "@/db";
import { comments, contentItems, placements, shareLinkItems, shareLinks, statuses } from "@/db/schema";
import { PLACEMENTS } from "@/lib/placements";
import { logActivity } from "@/server/activity";
import { returnToReviewIfApproved } from "@/server/approval";
import { requireSpaceAction } from "@/server/tenancy";
import { assignableMembers } from "@/server/table";
import { mergeCaptions, setPlatformCaption, splitCaptions } from "@/server/captions";
import { deliver } from "@/notifications/deliver";
import { assigneesOf, mentionedIn, postFollowers, postHref } from "@/notifications/content";

const platformSchema = z.enum(["instagram", "facebook", "linkedin"]);
const uuid = z.uuid();
const spacePath = (org: string, space: string) => `/o/${org}/s/${space}`;

export async function moveContent(org: string, space: string, contentId: string, statusId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await withOrg(ctx.org.id, async (tx) => {
    const [item] = await tx
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.id, uuid.parse(contentId)), eq(contentItems.spaceId, ctx.space.id)));
    const [target] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, uuid.parse(statusId)), eq(statuses.spaceId, ctx.space.id), eq(statuses.appliesTo, "content")));
    if (!item || !target) throw new Error("Content or status not found in this space.");
    if (item.statusId === target.id) return;
    const [from] = await tx.select({ name: statuses.name }).from(statuses).where(eq(statuses.id, item.statusId));

    await tx.update(contentItems).set({ statusId: target.id, updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
      action: "updated",
      field: "status",
      before: from?.name,
      after: target.name,
    });
    await deliver(tx, (await assigneesOf(tx, item.id)).filter((u) => u !== ctx.user.id), {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      kind: "status_changed",
      title: `${item.title} moved to ${target.name}`,
      body: `By ${ctx.user.name} in ${ctx.space.name}`,
      href: await postHref(tx, item),
    });
  });
  revalidatePath(spacePath(org, space), "layout");
}

export async function createContent(org: string, space: string, statusId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const id = await withOrg(ctx.org.id, async (tx) => {
    const [target] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, uuid.parse(statusId)), eq(statuses.spaceId, ctx.space.id), eq(statuses.appliesTo, "content")));
    if (!target) throw new Error("Status not found in this space.");
    const [{ top }] = await tx
      .select({ top: max(contentItems.position) })
      .from(contentItems)
      .where(eq(contentItems.spaceId, ctx.space.id));
    const [item] = await tx
      .insert(contentItems)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        title: "Untitled post",
        statusId: target.id,
        position: (top ?? 0) + 1,
        createdBy: ctx.user.id,
        autopost: ctx.space.autopostNewContent,
      })
      .returning();
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
      action: "created",
    });
    return item.id;
  });
  revalidatePath(spacePath(org, space), "layout");
  redirect(`${spacePath(org, space)}/board?content=${id}`);
}

const EDITABLE = z.enum(["title", "caption", "hashtags", "firstComment"]);

export async function updateContentField(org: string, space: string, contentId: string, field: string, value: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const key = EDITABLE.parse(field);
  const text = z.string().max(65_000).parse(value);
  if (key === "title" && text.trim() === "") throw new Error("Title can't be empty.");

  await withOrg(ctx.org.id, async (tx) => {
    const [item] = await tx
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.id, uuid.parse(contentId)), eq(contentItems.spaceId, ctx.space.id)));
    if (!item) throw new Error("Content not found in this space.");
    if (item[key] === text) return;
    // Later save wins (CT-13); the change log keeps the earlier value.
    await tx.update(contentItems).set({ [key]: text, updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
      action: "updated",
      field: key,
      before: item[key],
      after: text,
    });

    if (key !== "firstComment") await returnToReviewIfApproved(tx, item);
  });
  revalidatePath(spacePath(org, space), "layout");
}

export async function addComment(org: string, space: string, contentId: string, formData: FormData) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const body = z.string().trim().min(1).max(5000).parse(formData.get("body"));
  await withOrg(ctx.org.id, async (tx) => {
    const [item] = await tx
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.id, uuid.parse(contentId)), eq(contentItems.spaceId, ctx.space.id)));
    if (!item) throw new Error("Content not found in this space.");
    await tx.insert(comments).values({
      orgId: ctx.org.id,
      contentItemId: item.id,
      authorUserId: ctx.user.id,
      visibility: "private",
      body,
    });
    // @mentions first, then everyone else following the post.
    const href = await postHref(tx, item);
    const mentioned = mentionedIn(body, await assignableMembers(tx, ctx)).filter((u) => u !== ctx.user.id);
    const event = { orgId: ctx.org.id, spaceId: ctx.space.id, body: body.slice(0, 280), href };
    await deliver(tx, mentioned, { ...event, kind: "mention", title: `${ctx.user.name} mentioned you on “${item.title}”` });
    const others = (await postFollowers(tx, item.id)).filter((u) => u !== ctx.user.id && !mentioned.includes(u));
    await deliver(tx, others, { ...event, kind: "comment", title: `${ctx.user.name} commented on “${item.title}”` });
  });
  revalidatePath(spacePath(org, space), "layout");
}

/** Shares everything currently in the space's "in review" status as one link (SH-02). */
export async function shareForReview(org: string, space: string) {
  const ctx = await requireSpaceAction(org, space, "share.create");
  const token = randomBytes(24).toString("base64url");
  const created = await withOrg(ctx.org.id, async (tx) => {
    const [reviewStatus] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.reviewRole, "in_review")));
    if (!reviewStatus) return { error: "no-review-status" as const };
    const items = await tx
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.statusId, reviewStatus.id), isNull(contentItems.archivedAt)))
      .orderBy(asc(contentItems.scheduledAt));
    if (items.length === 0) return { error: "nothing-in-review" as const };

    const [link] = await tx
      .insert(shareLinks)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        token,
        title: `${ctx.space.name}: content for review`,
        permission: "approve",
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        createdBy: ctx.user.id,
      })
      .returning();
    await tx
      .insert(shareLinkItems)
      .values(items.map((it, position) => ({ orgId: ctx.org.id, shareLinkId: link.id, contentItemId: it.id, position })));
    for (const it of items) {
      await logActivity(tx, {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        contentItemId: it.id,
        actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
        action: "shared for review",
      });
    }
    return { count: items.length };
  });

  if ("error" in created) redirect(`${spacePath(org, space)}/board?share=${created.error}`);
  redirect(`${spacePath(org, space)}/board?shared=${token}&count=${created.count}`);
}

/** Inline caption help (CT-08). Returns a suggestion; nothing is saved until the person inserts it. */
export async function captionAssist(org: string, space: string, contentId: string, mode: string, platform?: string): Promise<{ text?: string; error?: string }> {
  const { CAPTION_MODES, aiErrorMessage, captionHelp, creditsUsedThisMonth, getBrandBrain, recordUsage } = await import("@/server/ai/service");
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const kind = z.enum(Object.keys(CAPTION_MODES) as [keyof typeof CAPTION_MODES, ...(keyof typeof CAPTION_MODES)[]]).parse(mode);
  if ((await creditsUsedThisMonth(ctx.org.id)) >= ctx.org.aiMonthlyCredits) return { error: "This month’s AI budget is used up." };
  const post = await withOrg(ctx.org.id, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, uuid.parse(contentId)), eq(contentItems.spaceId, ctx.space.id)));
    if (!item) return null;
    const all = await tx.select({ kind: placements.kind, captionOverride: placements.captionOverride }).from(placements).where(eq(placements.contentItemId, item.id));
    // CT-06: working on one platform's caption, so only its text and its placements.
    const only = platform ? platformSchema.parse(platform) : null;
    const pl = only ? all.filter((p) => PLACEMENTS[p.kind].platform === only) : all;
    const caption = only ? (pl.find((p) => p.captionOverride !== null)?.captionOverride ?? item.caption) : item.caption;
    return { title: item.title, caption, pillar: item.pillar, placements: pl.map((p) => p.kind) };
  });
  if (!post) return { error: "Post not found." };
  try {
    const brand = await getBrandBrain(ctx.org.id, ctx.space.id);
    const { text, usage, model } = await captionHelp({ mode: kind, post, brand: brand && { ...brand, captionLanguage: brand.captionLanguage as "en" | "hi" | "hinglish" } });
    await recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: ctx.space.id, kind: "caption", model, usage });
    return { text };
  } catch (e) {
    return { error: aiErrorMessage(e) };
  }
}

/* ---------- Per-platform captions (CT-06) ---------- */

export async function customiseCaptions(org: string, space: string, contentId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await splitCaptions(ctx, uuid.parse(contentId));
  revalidatePath(spacePath(org, space), "layout");
}

export async function savePlatformCaption(org: string, space: string, contentId: string, platform: string, value: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await setPlatformCaption(ctx, uuid.parse(contentId), platformSchema.parse(platform), z.string().max(65_000).parse(value));
  revalidatePath(spacePath(org, space), "layout");
}

export async function keepOneCaption(org: string, space: string, contentId: string, keep: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await mergeCaptions(ctx, uuid.parse(contentId), platformSchema.parse(keep));
  revalidatePath(spacePath(org, space), "layout");
}
