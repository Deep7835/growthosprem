"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { attachMedia, detachMedia, moveMedia } from "@/db/media";
import { contentItems, contentMedia, mediaAssets, mediaFolders } from "@/db/schema";
import { logActivity } from "@/server/activity";
import { returnToReviewIfApproved } from "@/server/approval";
import { requireSpaceAction } from "@/server/tenancy";
import { assetPrefix, getStorage } from "@/storage";

const uuid = z.uuid();
const spacePath = (org: string, space: string) => `/o/${org}/s/${space}`;

export async function createFolder(org: string, space: string, name: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const clean = z.string().trim().min(1, "Name the folder.").max(60).parse(name);
  await withOrg(ctx.org.id, (tx) => tx.insert(mediaFolders).values({ orgId: ctx.org.id, spaceId: ctx.space.id, name: clean }));
  revalidatePath(`${spacePath(org, space)}/media`);
}

/** Tags and folder (MD-01). */
export async function updateAsset(org: string, space: string, assetId: string, changes: { tags?: string[]; folderId?: string | null }) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const tags = changes.tags && [...new Set(z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).parse(changes.tags))];
  await withOrg(ctx.org.id, async (tx) => {
    if (changes.folderId) {
      const [folder] = await tx.select().from(mediaFolders).where(and(eq(mediaFolders.id, uuid.parse(changes.folderId)), eq(mediaFolders.spaceId, ctx.space.id)));
      if (!folder) throw new Error("Folder not found.");
    }
    await tx
      .update(mediaAssets)
      .set({ ...(tags ? { tags } : {}), ...(changes.folderId !== undefined ? { folderId: changes.folderId } : {}) })
      .where(and(eq(mediaAssets.id, uuid.parse(assetId)), eq(mediaAssets.spaceId, ctx.space.id)));
  });
  revalidatePath(`${spacePath(org, space)}/media`);
}

/**
 * Deletes an asset (MD-03). When posts use it, the first call returns them so the
 * person can confirm; with confirm the asset is removed from those posts too.
 */
export async function deleteAsset(org: string, space: string, assetId: string, confirm: boolean): Promise<{ inUse?: { id: string; title: string }[] }> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const id = uuid.parse(assetId);
  const result = await withOrg(ctx.org.id, async (tx) => {
    const [asset] = await tx.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.spaceId, ctx.space.id)));
    if (!asset) throw new Error("Media not found.");
    const used = await tx
      .select({ item: contentItems })
      .from(contentMedia)
      .innerJoin(contentItems, eq(contentItems.id, contentMedia.contentItemId))
      .where(eq(contentMedia.mediaAssetId, id));
    if (used.length && !confirm) return { inUse: used.map((u) => ({ id: u.item.id, title: u.item.title })) };
    for (const { item } of used) {
      await logActivity(tx, {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        contentItemId: item.id,
        actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
        action: `removed ${asset.filename} (deleted from the library)`,
      });
      await returnToReviewIfApproved(tx, item);
    }
    await tx.delete(mediaAssets).where(eq(mediaAssets.id, id));
    return { deleted: asset };
  });
  if ("inUse" in result) return { inUse: result.inUse };
  await getStorage().deletePrefix(assetPrefix(ctx.org.id, ctx.space.id, id));
  revalidatePath(spacePath(org, space), "layout");
  return {};
}

async function changeContentMedia(org: string, space: string, contentId: string, describe: string, change: (tx: Parameters<Parameters<typeof withOrg>[1]>[0], itemId: string) => Promise<unknown>) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await withOrg(ctx.org.id, async (tx) => {
    const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, uuid.parse(contentId)), eq(contentItems.spaceId, ctx.space.id)));
    if (!item) throw new Error("Post not found in this space.");
    await change(tx, item.id);
    await tx.update(contentItems).set({ updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
      action: describe,
      field: "media",
    });
    await returnToReviewIfApproved(tx, item);
  });
  revalidatePath(spacePath(org, space), "layout");
}

export async function attachToContent(org: string, space: string, contentId: string, assetIds: string[]) {
  const ids = z.array(uuid).min(1).max(20).parse(assetIds);
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await changeContentMedia(org, space, contentId, `added ${ids.length === 1 ? "media" : `${ids.length} media files`}`, async (tx, itemId) => {
    // Only ready media from this space.
    const valid = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.spaceId, ctx.space.id), eq(mediaAssets.status, "ready")));
    const ordered = ids.filter((id) => valid.some((v) => v.id === id));
    if (ordered.length === 0) throw new Error("That media isn’t ready yet.");
    await attachMedia(tx, ctx.org.id, itemId, ordered);
  });
}

export async function detachFromContent(org: string, space: string, contentId: string, assetId: string) {
  await changeContentMedia(org, space, contentId, "removed media", (tx, itemId) => detachMedia(tx, itemId, uuid.parse(assetId)));
}

export async function moveContentMedia(org: string, space: string, contentId: string, assetId: string, direction: -1 | 1) {
  const dir = z.union([z.literal(-1), z.literal(1)]).parse(direction);
  await changeContentMedia(org, space, contentId, "reordered media", (tx, itemId) => moveMedia(tx, itemId, uuid.parse(assetId), dir));
}
