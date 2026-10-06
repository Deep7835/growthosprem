import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { duplicateContent, groupSiblings, repurposeContent, shareContent } from "./content-ops";
import type { SpaceContext } from "./tenancy";

let db: Db;
let ctx: SpaceContext;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [org] = await db.select().from(s.organizations);
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
  ctx = { org, space, user, role: "owner", project: null, requestTime: Date.now(), can: () => true } as unknown as SpaceContext;
}, 60_000);

/** A Cafe post with two unscheduled placements and its own Instagram caption. */
async function twoPlatformPost() {
  const [status] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, ctx.space.id), eq(s.statuses.appliesTo, "content")));
  const [item] = await db.insert(s.contentItems).values({ orgId: ctx.org.id, spaceId: ctx.space.id, title: "Diwali reel", statusId: status.id, caption: "Shared caption", tags: ["diwali"] }).returning();
  await db.insert(s.placements).values([
    { orgId: ctx.org.id, contentItemId: item.id, kind: "ig_reel", captionOverride: "Instagram caption" },
    { orgId: ctx.org.id, contentItemId: item.id, kind: "fb_reel" },
  ]);
  await db.insert(s.contentAssignees).values({ orgId: ctx.org.id, contentItemId: item.id, userId: ctx.user.id });
  return item;
}

describe("post window operations", () => {
  it("duplicates a post as a draft with its text, tags, platforms and assignees", async () => {
    const item = await twoPlatformPost();
    const copy = await duplicateContent(ctx, item.id);
    expect(copy).toMatchObject({ title: "Diwali reel (copy)", caption: "Shared caption", tags: ["diwali"], publishState: "not_scheduled", scheduledAt: null });
    const kinds = (await db.select().from(s.placements).where(eq(s.placements.contentItemId, copy.id))).map((p) => p.kind).sort();
    expect(kinds).toEqual(["fb_reel", "ig_reel"]);
    expect(await db.select().from(s.contentAssignees).where(eq(s.contentAssignees.contentItemId, copy.id))).toHaveLength(1);
  });

  it("repurposes into one post per placement, linked as a group, with each platform's own caption", async () => {
    const item = await twoPlatformPost();
    const r = await repurposeContent(ctx, item.id);
    expect(r.created).toHaveLength(1);
    const group = await db.select().from(s.contentItems).where(inArray(s.contentItems.id, [item.id, ...r.created]));
    expect(new Set(group.map((g) => g.groupId))).toEqual(new Set([item.id]));
    const kept = group.find((g) => g.id === item.id)!;
    const made = group.find((g) => g.id === r.created[0])!;
    expect(kept.caption).toBe("Instagram caption");
    expect(made.caption).toBe("Shared caption");
    const placementsOf = async (id: string) => (await db.select().from(s.placements).where(eq(s.placements.contentItemId, id))).map((p) => [p.kind, p.captionOverride]);
    expect(await placementsOf(item.id)).toEqual([["ig_reel", null]]);
    expect(await placementsOf(made.id)).toEqual([["fb_reel", null]]);
    const siblings = await db.transaction((tx) => groupSiblings(tx as never, { id: item.id, groupId: item.id }));
    expect(siblings.map((x) => x.kinds)).toEqual([["ig_reel"], ["fb_reel"]]);
    // One placement left: nothing more to split.
    await expect(repurposeContent(ctx, item.id)).rejects.toThrow(/at least two platforms/);
  });

  it("refuses to repurpose a scheduled post", async () => {
    const item = await twoPlatformPost();
    await db.update(s.contentItems).set({ publishState: "scheduled" }).where(eq(s.contentItems.id, item.id));
    await expect(repurposeContent(ctx, item.id)).rejects.toThrow(/Unschedule it first/);
  });

  it("shares chosen posts with a permission and an expiry, and only posts in this space", async () => {
    const a = await twoPlatformPost();
    const b = await twoPlatformPost();
    const r = await shareContent(ctx, [b.id, a.id], { permission: "view", expiresInDays: 7 });
    const [link] = await db.select().from(s.shareLinks).where(eq(s.shareLinks.token, r.token));
    expect(link.permission).toBe("view");
    expect(Math.round((link.expiresAt!.getTime() - Date.now()) / 864e5)).toBe(7);
    const items = await db.select().from(s.shareLinkItems).where(eq(s.shareLinkItems.shareLinkId, link.id));
    expect(items.sort((x, y) => x.position - y.position).map((i) => i.contentItemId)).toEqual([b.id, a.id]);
    const [other] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "real-estate"));
    const [status] = await db.select().from(s.statuses).where(eq(s.statuses.spaceId, other.id));
    const [elsewhere] = await db.insert(s.contentItems).values({ orgId: ctx.org.id, spaceId: other.id, title: "Not here", statusId: status.id }).returning();
    await expect(shareContent(ctx, [elsewhere.id], { permission: "approve", expiresInDays: null })).rejects.toThrow(/Choose at least one post/);
  });
});
