import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getSystemDb, withOrg, type Tx } from "@/db";
import { mediaForContent } from "@/db/media";
import { approvals, contentItems, contentMedia, organizations, placements, shareLinkItems, shareLinks, socialAccounts, spaces } from "@/db/schema";
import type { PlacementKind } from "@/lib/placements";
import { previewsFor } from "./previews";
import { contentVersionHash } from "@/lib/content-version";

export type LinkState = "ok" | "revoked" | "expired" | "missing";

/** Looks up a share link by its token. The only cross-tenant read in the review flow. */
export async function resolveShareLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { state: "missing" as const };
  const db = await getSystemDb();
  const [row] = await db
    .select({ link: shareLinks, orgName: organizations.name, brandColor: organizations.brandColor, spaceName: spaces.name, timezone: spaces.timezone })
    .from(shareLinks)
    .innerJoin(organizations, eq(organizations.id, shareLinks.orgId))
    .innerJoin(spaces, eq(spaces.id, shareLinks.spaceId))
    .where(eq(shareLinks.token, token));
  if (!row) return { state: "missing" as const };
  if (row.link.revokedAt) return { state: "revoked" as const, ...row };
  if (row.link.expiresAt && row.link.expiresAt < new Date()) return { state: "expired" as const, ...row };
  return { state: "ok" as const, ...row };
}

export async function currentVersionHash(tx: Tx, item: typeof contentItems.$inferSelect) {
  const [pl, media] = await Promise.all([
    tx.select({ kind: placements.kind, captionOverride: placements.captionOverride }).from(placements).where(eq(placements.contentItemId, item.id)),
    tx.select({ id: contentMedia.mediaAssetId }).from(contentMedia).where(eq(contentMedia.contentItemId, item.id)).orderBy(asc(contentMedia.position)),
  ]);
  return contentVersionHash({ title: item.title, caption: item.caption, hashtags: item.hashtags, placements: pl, media: media.map((m) => m.id) });
}

export async function loadReviewItems(orgId: string, shareLinkId: string, token: string) {
  return withOrg(orgId, async (tx) => {
    const [{ space }] = await tx
      .select({ space: spaces })
      .from(shareLinks)
      .innerJoin(spaces, eq(spaces.id, shareLinks.spaceId))
      .where(eq(shareLinks.id, shareLinkId));
    const rows = await tx
      .select({ item: contentItems })
      .from(shareLinkItems)
      .innerJoin(contentItems, eq(contentItems.id, shareLinkItems.contentItemId))
      .where(eq(shareLinkItems.shareLinkId, shareLinkId))
      .orderBy(asc(shareLinkItems.position));
    const ids = rows.map((r) => r.item.id);
    if (ids.length === 0) return [];
    const [pl, decisions, media, accounts] = await Promise.all([
      tx.select().from(placements).where(inArray(placements.contentItemId, ids)).orderBy(asc(placements.createdAt)),
      tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.shareLinkId, shareLinkId), inArray(approvals.contentItemId, ids)))
        .orderBy(desc(approvals.createdAt)),
      mediaForContent(tx, ids),
      tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, space.id)),
    ]);
    const src = (id: string, variant: "original" | "thumb") => `/api/review/${token}/media/${id}${variant === "thumb" ? "?v=thumb" : ""}`;
    return Promise.all(
      rows.map(async ({ item }) => {
        const hash = await currentVersionHash(tx, item);
        const latest = decisions.find((d) => d.contentItemId === item.id);
        // A decision on an older version no longer counts (SH-07).
        const decision = latest && latest.versionHash === hash ? latest : null;
        return {
          id: item.id,
          title: item.title,
          caption: item.caption,
          hashtags: item.hashtags,
          scheduledAt: item.scheduledAt?.toISOString() ?? null,
          kinds: pl.filter((p) => p.contentItemId === item.id).map((p) => p.kind),
          media: media
            .filter((m) => m.contentId === item.id && m.asset.status === "ready")
            .map((m) => ({ id: m.asset.id, type: m.asset.type, width: m.asset.width, height: m.asset.height, hasThumb: Boolean(m.asset.thumbKey) })),
          decision: decision ? { kind: decision.decision, by: decision.reviewerName, note: decision.note, at: decision.createdAt.toISOString() } : null,
          changedSinceDecision: Boolean(latest && !decision),
          // SH-03: the client sees each placement as it will look.
          previews: previewsFor({
            item,
            placements: pl.filter((p) => p.contentItemId === item.id).map((p) => ({ ...p, kind: p.kind as PlacementKind })),
            assets: media.filter((m) => m.contentId === item.id).map((m) => m.asset),
            accounts,
            space,
            src,
          }).map((p) => ({ ...p, issues: [] })),
        };
      }),
    );
  });
}
