import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { sealToken } from "@/lib/crypto";
import { createFakeGraph } from "@/lib/meta/fake";
import { GraphError, type Graph } from "@/lib/meta/graph";
import { checkTokenHealth, enqueueImport, sameLink, scheduleRecurring, syncAccount } from "./meta-sync";
import { PermanentError } from "./queue";
import { drain } from "./worker";

let db: Db;
let orgId: string;
let spaceId: string;
const now = new Date("2026-10-05T12:00:00Z");
const graph = createFakeGraph({ delayMs: 0, now: () => now });

async function addAccount(values: Partial<typeof s.socialAccounts.$inferInsert> & { externalId: string; platform: "instagram" | "facebook" }) {
  const [row] = await db
    .insert(s.socialAccounts)
    .values({ orgId, spaceId, handle: values.externalId, accessTokenEnc: sealToken(`fake-token:${values.externalId}`), status: "active", ...values })
    .returning();
  return row;
}

const count = async (table: typeof s.posts | typeof s.postMetrics, accountId: string) => {
  const rows = await db.execute(
    table === s.posts
      ? sql`select count(*)::int as n from posts where social_account_id = ${accountId}`
      : sql`select count(*)::int as n from post_metrics m join posts p on p.id = m.post_id where p.social_account_id = ${accountId}`,
  );
  return (rows as unknown as { rows: { n: number }[] }).rows[0].n;
};

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  db = await createPgliteDb();
  await seed(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  orgId = cafe.orgId;
  spaceId = cafe.id;
}, 60_000);

describe("Instagram and Facebook import and sync", () => {
  it("imports 90 days of posts, numbers and followers once", async () => {
    const ig = await addAccount({ platform: "instagram", externalId: "fake_ig_cafe" });
    const result = await syncAccount({ db, graph, now: () => now }, ig.id, "import");
    expect(result.posts).toBeGreaterThan(10);
    expect(await count(s.posts, ig.id)).toBe(result.posts);
    expect(await count(s.postMetrics, ig.id)).toBe(result.posts);

    const [after] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.id, ig.id));
    expect(after).toMatchObject({ handle: "@cafe.delhi", syncState: null, status: "active" });
    expect(after.lastSyncedAt?.getTime()).toBe(now.getTime());
    const followers = await db.select().from(s.accountMetricsDaily).where(eq(s.accountMetricsDaily.socialAccountId, ig.id));
    expect(followers).toEqual([expect.objectContaining({ day: "2026-10-05", followers: 9820 })]);

    // Running again changes nothing: no post passed a checkpoint since.
    await syncAccount({ db, graph, now: () => now }, ig.id, "sync");
    expect(await count(s.posts, ig.id)).toBe(result.posts);
    expect(await count(s.postMetrics, ig.id)).toBe(result.posts);
  });

  it("backfills Facebook follower history and stores no tokens in plain text", async () => {
    const fb = await addAccount({ platform: "facebook", externalId: "fake_fb_cafe" });
    await syncAccount({ db, graph, now: () => now }, fb.id, "import");
    const days = await db.select().from(s.accountMetricsDaily).where(eq(s.accountMetricsDaily.socialAccountId, fb.id));
    expect(days.length).toBeGreaterThan(80);
    const [stored] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.id, fb.id));
    expect(stored.accessTokenEnc).not.toContain("fake-token");
  });

  it("marks the account for reconnecting when Meta rejects the token", async () => {
    const revoked: Graph = { ...graph, profile: async () => Promise.reject(new GraphError("Session has been invalidated", 190, 400)) };
    const ig = await addAccount({ platform: "instagram", externalId: "revoked_ig", handle: "@revoked" });
    await expect(syncAccount({ db, graph: revoked, now: () => now }, ig.id, "sync")).rejects.toBeInstanceOf(PermanentError);
    const [row] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.id, ig.id));
    expect(row).toMatchObject({ status: "reconnect_needed", syncState: null });
    const log = await db.select().from(s.activityLog).where(and(eq(s.activityLog.targetId, ig.id), eq(s.activityLog.action, "reconnect_needed")));
    expect(log).toHaveLength(1);
    // Accounts that need reconnecting aren't synced on schedule.
    expect(await syncAccount({ db, graph, now: () => now }, ig.id, "sync")).toEqual({ skipped: "reconnect_needed" });
  });

  it("warns seven days before access expires", async () => {
    const fb = await addAccount({ platform: "facebook", externalId: "fake_fb_greenleaf" });
    await checkTokenHealth({ db, graph, now: () => now }, fb.id);
    const [row] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.id, fb.id));
    expect(row.status).toBe("expiring");
    expect(row.tokenExpiresAt?.getTime()).toBe(now.getTime() + 5 * 864e5);
  });

  it("schedules hourly syncs and daily checks once per period", async () => {
    await db.delete(s.jobs);
    await scheduleRecurring(db, now);
    const first = await db.select().from(s.jobs);
    await scheduleRecurring(db, new Date(now.getTime() + 60_000));
    expect(await db.select().from(s.jobs)).toHaveLength(first.length);
    const live = await db.select().from(s.socialAccounts).where(sql`access_token_enc is not null and status in ('active','expiring')`);
    expect(first).toHaveLength(live.length * 2);
  });

  it("runs a queued import through the worker", async () => {
    await db.delete(s.jobs);
    const fb = await addAccount({ platform: "facebook", externalId: "fake_fb_greenleaf_2", handle: "x" });
    // The sample graph only knows its own pages, so point this one at Green Leaf's posts.
    const g: Graph = { ...graph, profile: (p, _id, t) => graph.profile(p, "fake_fb_greenleaf", t), listPosts: (p, _id, t, since) => graph.listPosts(p, "fake_fb_greenleaf", t, since) };
    await enqueueImport(db, fb.id, now);
    expect(await drain({ getDb: async () => db, getGraph: () => g })).toBe(1);
    expect(await count(s.posts, fb.id)).toBe(6);
    const [job] = await db.select().from(s.jobs);
    expect(job.doneAt).not.toBeNull();
  });
});

describe("matching a manually posted link", () => {
  it("ignores www, query strings and trailing slashes", () => {
    expect(sameLink("https://www.instagram.com/p/AbC/?igsh=x", "https://instagram.com/p/abc")).toBe(true);
    expect(sameLink("https://www.instagram.com/p/one/", "https://www.instagram.com/p/two/")).toBe(false);
  });
});
