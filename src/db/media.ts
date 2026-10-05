// Media library data (PRD 6.12, CT-02). Free of Next.js imports so it can be tested.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { withOrg, type Db, type Tx } from "./core";
import * as s from "./schema";

/** The Brand assets folder, created once (MD-04). Project folders are made with the project when chosen (PJ-01). */
export async function ensureDefaultFolders(tx: Tx, orgId: string, spaceId: string) {
  const folders = await tx.select().from(s.mediaFolders).where(eq(s.mediaFolders.spaceId, spaceId));
  if (!folders.some((f) => f.isBrandAssets)) {
    await tx.insert(s.mediaFolders).values({ orgId, spaceId, name: "Brand assets", isBrandAssets: true });
  }
}

export async function listLibrary(db: Db, orgId: string, spaceId: string) {
  return withOrg(db, orgId, async (tx) => {
    await ensureDefaultFolders(tx, orgId, spaceId);
    const [folders, assets, usage, [{ used }]] = await Promise.all([
      tx.select().from(s.mediaFolders).where(eq(s.mediaFolders.spaceId, spaceId)).orderBy(asc(s.mediaFolders.createdAt)),
      tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.spaceId, spaceId)).orderBy(sql`${s.mediaAssets.createdAt} desc`),
      tx
        .select({ assetId: s.contentMedia.mediaAssetId, contentId: s.contentItems.id, title: s.contentItems.title })
        .from(s.contentMedia)
        .innerJoin(s.contentItems, eq(s.contentItems.id, s.contentMedia.contentItemId))
        .where(eq(s.contentItems.spaceId, spaceId)),
      tx.select({ used: sql<number>`coalesce(sum(${s.mediaAssets.sizeBytes}), 0)::bigint` }).from(s.mediaAssets),
    ]);
    return {
      folders,
      assets: assets.map((a) => ({ ...a, usedIn: usage.filter((u) => u.assetId === a.id).map(({ contentId, title }) => ({ contentId, title })) })),
      // Storage is counted across the whole organisation, against the plan limit (MD-05).
      usedBytes: Number(used),
    };
  });
}

export type Library = Awaited<ReturnType<typeof listLibrary>>;
export type LibraryAsset = Library["assets"][number];

/** Media attached to posts, in order, for the content panel, board and review page. */
export async function mediaForContent(tx: Tx, contentIds: string[]) {
  if (contentIds.length === 0) return [];
  return tx
    .select({ contentId: s.contentMedia.contentItemId, position: s.contentMedia.position, asset: s.mediaAssets })
    .from(s.contentMedia)
    .innerJoin(s.mediaAssets, eq(s.mediaAssets.id, s.contentMedia.mediaAssetId))
    .where(inArray(s.contentMedia.contentItemId, contentIds))
    .orderBy(asc(s.contentMedia.position));
}

/** Adds assets to the end of a post's media, skipping ones already attached. */
export async function attachMedia(tx: Tx, orgId: string, contentId: string, assetIds: string[]) {
  const existing = await tx.select().from(s.contentMedia).where(eq(s.contentMedia.contentItemId, contentId));
  const fresh = [...new Set(assetIds)].filter((id) => !existing.some((e) => e.mediaAssetId === id));
  const start = existing.reduce((m, e) => Math.max(m, e.position + 1), 0);
  if (fresh.length) {
    await tx.insert(s.contentMedia).values(fresh.map((mediaAssetId, i) => ({ orgId, contentItemId: contentId, mediaAssetId, position: start + i })));
  }
  return fresh.length;
}

export async function detachMedia(tx: Tx, contentId: string, assetId: string) {
  await tx.delete(s.contentMedia).where(and(eq(s.contentMedia.contentItemId, contentId), eq(s.contentMedia.mediaAssetId, assetId)));
  await renumber(tx, contentId);
}

/** Moves one item earlier or later; position 0 is the cover. */
export async function moveMedia(tx: Tx, contentId: string, assetId: string, direction: -1 | 1) {
  const rows = await tx.select().from(s.contentMedia).where(eq(s.contentMedia.contentItemId, contentId)).orderBy(asc(s.contentMedia.position));
  const i = rows.findIndex((r) => r.mediaAssetId === assetId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [position, r] of rows.entries()) {
    await tx.update(s.contentMedia).set({ position }).where(and(eq(s.contentMedia.contentItemId, contentId), eq(s.contentMedia.mediaAssetId, r.mediaAssetId)));
  }
}

async function renumber(tx: Tx, contentId: string) {
  const rows = await tx.select().from(s.contentMedia).where(eq(s.contentMedia.contentItemId, contentId)).orderBy(asc(s.contentMedia.position));
  for (const [position, r] of rows.entries()) {
    if (r.position !== position) {
      await tx.update(s.contentMedia).set({ position }).where(and(eq(s.contentMedia.contentItemId, contentId), eq(s.contentMedia.mediaAssetId, r.mediaAssetId)));
    }
  }
}
