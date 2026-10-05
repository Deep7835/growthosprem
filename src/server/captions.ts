import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentItems, placements } from "@/db/schema";
import { PLACEMENTS, PLATFORM_NAMES, type PlacementKind, type Platform } from "@/lib/placements";
import { logActivity } from "./activity";
import { returnToReviewIfApproved } from "./approval";
import type { SpaceContext } from "./tenancy";

// CT-06: one shared caption by default; "Customise per platform" gives each platform its own.
// A platform's caption lives on its placements (caption_override); published ones keep theirs.

async function load(tx: Tx, ctx: SpaceContext, contentItemId: string) {
  const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, contentItemId), eq(contentItems.spaceId, ctx.space.id)));
  if (!item) throw new Error("That post isn’t in this space.");
  const list = await tx.select().from(placements).where(eq(placements.contentItemId, item.id));
  return { item, list };
}

const kindsOf = (platform: Platform) => (Object.keys(PLACEMENTS) as PlacementKind[]).filter((k) => PLACEMENTS[k].platform === platform);
const actor = (ctx: SpaceContext) => ({ kind: "user" as const, userId: ctx.user.id, name: ctx.user.name });

/** Splits the shared caption into one per platform, each starting as the shared text. */
export async function splitCaptions(ctx: SpaceContext, contentItemId: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const { item, list } = await load(tx, ctx, contentItemId);
    if (list.length === 0) throw new Error("Add a platform first.");
    await tx
      .update(placements)
      .set({ captionOverride: item.caption })
      .where(and(eq(placements.contentItemId, item.id), ne(placements.state, "published")));
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: item.id, actor: actor(ctx), action: "customised the caption per platform" });
  });
}

/** One platform's caption. */
export async function setPlatformCaption(ctx: SpaceContext, contentItemId: string, platform: Platform, text: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const { item, list } = await load(tx, ctx, contentItemId);
    const mine = list.filter((p) => PLACEMENTS[p.kind as PlacementKind].platform === platform && p.state !== "published");
    if (mine.length === 0) throw new Error(`This post isn’t going to ${PLATFORM_NAMES[platform]}.`);
    const before = mine[0].captionOverride ?? item.caption;
    if (mine.every((p) => p.captionOverride === text)) return;
    await tx
      .update(placements)
      .set({ captionOverride: text })
      .where(and(eq(placements.contentItemId, item.id), inArray(placements.kind, kindsOf(platform)), ne(placements.state, "published")));
    await tx.update(contentItems).set({ updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: actor(ctx),
      action: "updated",
      field: `${PLATFORM_NAMES[platform]} caption`,
      before,
      after: text,
    });
    await returnToReviewIfApproved(tx, item);
  });
}

/** Back to one caption for every platform, keeping the text of the platform chosen. */
export async function mergeCaptions(ctx: SpaceContext, contentItemId: string, keep: Platform) {
  await withOrg(ctx.org.id, async (tx) => {
    const { item, list } = await load(tx, ctx, contentItemId);
    const source = list.find((p) => PLACEMENTS[p.kind as PlacementKind].platform === keep && p.captionOverride !== null);
    const text = source?.captionOverride ?? item.caption;
    await tx.update(placements).set({ captionOverride: null }).where(and(eq(placements.contentItemId, item.id), ne(placements.state, "published")));
    if (text !== item.caption) {
      await tx.update(contentItems).set({ caption: text, updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    }
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: item.id,
      actor: actor(ctx),
      action: `went back to one caption (kept the ${PLATFORM_NAMES[keep]} one)`,
    });
    await returnToReviewIfApproved(tx, item);
  });
}
