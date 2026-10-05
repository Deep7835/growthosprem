import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { sealToken } from "@/lib/crypto";
import { createFakeGraph } from "@/lib/meta/fake";
import type { Graph } from "@/lib/meta/graph";
import type { PlacementKind } from "@/lib/placements";
import { publicMediaUrl, verifyMediaSignature } from "./media-url";
import { reconcileScheduled } from "./reconcile";
import { publishPlacement, PUBLISH_JOB, sendReminder } from "./run";

let db: Db;
let orgId: string;
let spaceId: string;
let approvedStatus: string;
let ideaStatus: string;
let accounts: Record<"instagram" | "facebook", string>;
const now = new Date("2026-10-05T12:00:00Z");
const graph = createFakeGraph({ delayMs: 0, now: () => now });

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  db = await createPgliteDb();
  await seed(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  orgId = cafe.orgId;
  spaceId = cafe.id;
  await db.update(s.spaces).set({ requireClientApproval: false }).where(eq(s.spaces.id, spaceId));
  const statuses = await db.select().from(s.statuses).where(eq(s.statuses.spaceId, spaceId));
  approvedStatus = statuses.find((x) => x.name === "Approved")!.id;
  ideaStatus = statuses.find((x) => x.name === "Idea")!.id;
  // Replace the seeded sample accounts with connected (sample-mode) ones.
  await db.delete(s.socialAccounts).where(eq(s.socialAccounts.spaceId, spaceId));
  const rows = await db
    .insert(s.socialAccounts)
    .values([
      { orgId, spaceId, platform: "instagram", handle: "@cafe.delhi", externalId: "fake_ig_cafe", accessTokenEnc: sealToken("t1"), isDemo: true },
      { orgId, spaceId, platform: "facebook", handle: "Cafe Delhi", externalId: "fake_fb_cafe", accessTokenEnc: sealToken("t2"), isDemo: true },
    ])
    .returning();
  accounts = { instagram: rows[0].id, facebook: rows[1].id };
}, 60_000);

let rahul: string;
beforeEach(async () => {
  [{ id: rahul }] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, "rahul@example.com"));
});

/** A post scheduled for `now` with autopost on, one image and the given placements. */
async function scheduledPost(opts: { kinds: PlacementKind[]; caption?: string; autopost?: boolean; status?: string }) {
  const [item] = await db
    .insert(s.contentItems)
    .values({ orgId, spaceId, title: "Monsoon menu", statusId: opts.status ?? approvedStatus, caption: opts.caption ?? "Monsoon menu is here", scheduledAt: now, autopost: opts.autopost ?? true, publishState: "scheduled", createdBy: rahul })
    .returning();
  const [asset] = await db
    .insert(s.mediaAssets)
    .values({ orgId, spaceId, type: "image", status: "ready", filename: "menu.jpg", mimeType: "image/jpeg", sizeBytes: 200_000, width: 1080, height: 1350, storageKey: "x" })
    .returning();
  await db.insert(s.contentMedia).values({ orgId, contentItemId: item.id, mediaAssetId: asset.id, position: 0 });
  const pls = await db
    .insert(s.placements)
    .values(opts.kinds.map((kind) => ({ orgId, contentItemId: item.id, kind, state: "scheduled" as const, socialAccountId: accounts[kind.startsWith("ig") ? "instagram" : "facebook"] })))
    .returning();
  return { item, placements: pls };
}

const run = (placementId: string, g: Graph = graph, attempt = { n: 1, max: 3 }) =>
  publishPlacement({ db, graph: g, now: () => now }, { placementId, scheduledAt: now.toISOString() }, attempt);

const itemState = async (id: string) => (await db.select().from(s.contentItems).where(eq(s.contentItems.id, id)))[0].publishState;

describe("publishing a placement", () => {
  it("publishes, stores the post for analytics and tells the team", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post"] });
    expect(await run(placements[0].id)).toBe("published");

    const [p] = await db.select().from(s.placements).where(eq(s.placements.id, placements[0].id));
    expect(p).toMatchObject({ state: "published", publishStep: "publish_sent", error: null });
    expect(p.externalId).toMatch(/^fake_ig_cafe_pub_/);
    expect(await itemState(item.id)).toBe("published");
    const [post] = await db.select().from(s.posts).where(eq(s.posts.contentItemId, item.id));
    expect(post).toMatchObject({ externalId: p.externalId, format: "post", socialAccountId: accounts.instagram });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.kind, "published"));
    expect(notes.map((n) => n.userId)).toContain(rahul);
  });

  it("skips jobs for posts that were rescheduled or unscheduled", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post"] });
    await db.update(s.contentItems).set({ scheduledAt: new Date(now.getTime() + 3600_000) }).where(eq(s.contentItems.id, item.id));
    expect(await run(placements[0].id)).toBe("skipped");
    await db.update(s.placements).set({ state: "draft" }).where(eq(s.placements.id, placements[0].id));
    expect(await run(placements[0].id)).toBe("skipped");
  });

  it("runs the readiness check again just before publishing", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post"], status: ideaStatus });
    expect(await run(placements[0].id)).toBe("failed");
    const [p] = await db.select().from(s.placements).where(eq(s.placements.id, placements[0].id));
    expect(p.error).toMatch(/can’t publish automatically/);
    expect(await itemState(item.id)).toBe("failed");
  });

  it("fails at once on a permanent error, notifies managers and queues the follow-up email", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post", "fb_post"], caption: "Broken #samplefail" });
    expect(await run(placements[0].id)).toBe("failed");
    const failedNotes = await db.select().from(s.notifications).where(and(eq(s.notifications.kind, "publish_failed")));
    expect(failedNotes.map((n) => n.userId)).toContain(rahul);
    const followups = await db.select().from(s.jobs).where(eq(s.jobs.kind, PUBLISH_JOB.followup));
    expect(followups.some((j) => (j.payload as { placementId: string }).placementId === placements[0].id)).toBe(true);
    expect(followups[0].runAt.getTime()).toBe(now.getTime() + 30 * 60_000);
    // The other placement still runs: the item ends up failed, not partly published.
    expect(await run(placements[1].id)).toBe("failed");
    expect(await itemState(item.id)).toBe("failed");
  });

  it("shows partly published when only some placements fail", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post", "fb_post"] });
    await run(placements[0].id);
    await db.update(s.placements).set({ state: "failed", error: "x" }).where(eq(s.placements.id, placements[1].id));
    const { syncItemState } = await import("./run");
    await db.transaction((tx) => syncItemState(tx, item.id));
    expect(await itemState(item.id)).toBe("partially_published");
  });

  it("retries temporary errors, then succeeds", async () => {
    const { placements } = await scheduledPost({ kinds: ["fb_post"], caption: "Wobbly #sampleflaky" });
    await expect(run(placements[0].id, graph, { n: 1, max: 3 })).rejects.toThrow(/temporary/);
    const [mid] = await db.select().from(s.placements).where(eq(s.placements.id, placements[0].id));
    expect(mid).toMatchObject({ state: "publishing" });
    expect(mid.error).toMatch(/^Retrying/);
    expect(await run(placements[0].id, graph, { n: 2, max: 3 })).toBe("published");
  });

  it("never re-sends a publish that may have gone out", async () => {
    const { placements } = await scheduledPost({ kinds: ["ig_post"] });
    await db.update(s.placements).set({ state: "publishing", publishStep: "publish_sent" }).where(eq(s.placements.id, placements[0].id));
    let called = false;
    const watching: Graph = { ...graph, publish: async (...a) => ((called = true), graph.publish(...a)) };
    expect(await run(placements[0].id, watching)).toBe("failed");
    expect(called).toBe(false);
    const [p] = await db.select().from(s.placements).where(eq(s.placements.id, placements[0].id));
    expect(p.error).toMatch(/couldn’t confirm/);
  });

  it("reminds people when autopost is off instead of publishing", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["ig_post"], autopost: false });
    expect(await run(placements[0].id)).toBe("skipped");
    await sendReminder({ db }, { contentItemId: item.id, orgId, scheduledAt: now.toISOString() });
    const [note] = await db.select().from(s.notifications).where(eq(s.notifications.kind, "publish_reminder"));
    expect(note.title).toBe("Time to post: Monsoon menu");
    expect(note.href).toContain(`content=${item.id}`);
  });
});

describe("the scheduling safety net", () => {
  it("queues due placements that have no job, once", async () => {
    await db.delete(s.jobs);
    const { placements } = await scheduledPost({ kinds: ["ig_post"] });
    await reconcileScheduled(db, new Date(now.getTime() + 60_000));
    await reconcileScheduled(db, new Date(now.getTime() + 120_000));
    const jobs = (await db.select().from(s.jobs).where(eq(s.jobs.kind, PUBLISH_JOB.publish))).filter(
      (j) => (j.payload as { placementId: string }).placementId === placements[0].id,
    );
    expect(jobs).toHaveLength(1);
  });

  it("fails posts that missed their time by hours instead of posting late", async () => {
    const { item, placements } = await scheduledPost({ kinds: ["fb_post"] });
    await reconcileScheduled(db, new Date(now.getTime() + 7 * 3600_000));
    const [p] = await db.select().from(s.placements).where(eq(s.placements.id, placements[0].id));
    expect(p.state).toBe("failed");
    expect(p.error).toMatch(/Missed its scheduled time/);
    expect(await itemState(item.id)).toBe("failed");
  });
});

describe("public media links", () => {
  it("only work for the signed file until they expire", () => {
    const url = new URL(publicMediaUrl("11111111-1111-4111-8111-111111111111", now.getTime(), "https://app.test"));
    const [exp, sig] = [url.searchParams.get("exp"), url.searchParams.get("sig")];
    expect(verifyMediaSignature("11111111-1111-4111-8111-111111111111", exp, sig, now.getTime())).toBe(true);
    expect(verifyMediaSignature("22222222-2222-4222-8222-222222222222", exp, sig, now.getTime())).toBe(false);
    expect(verifyMediaSignature("11111111-1111-4111-8111-111111111111", exp, sig, now.getTime() + 7 * 3600_000)).toBe(false);
  });
});
