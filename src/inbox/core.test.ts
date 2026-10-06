import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, withOrg, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { createGraph } from "@/lib/meta/graph";
import { addSampleConversations, storeComments, type InboxAccount } from "./core";

let db: Db;
let account: InboxAccount;
const at = (h: number) => new Date(Date.UTC(2026, 9, 6, h));

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  account = { id: null, orgId: cafe.orgId, spaceId: cafe.id, platform: "instagram", handle: "@cafe.delhi", name: "Cafe Delhi" };
}, 60_000);

describe("inbox comments", () => {
  it("makes one thread per comment, with our own replies as outgoing, and doesn't duplicate on re-sync", async () => {
    const comments = [{ externalId: "c1", author: "@priya.eats", text: "Delivery in Saket?", at: at(8), replies: [{ externalId: "r1", author: "@cafe.delhi", text: "Yes! Order on our site.", at: at(9) }] }];
    expect(await withOrg(db, account.orgId, (tx) => storeComments(tx, account, null, comments))).toBe(1);
    expect(await withOrg(db, account.orgId, (tx) => storeComments(tx, account, null, comments))).toBe(0);
    const [thread] = await db.select().from(s.inboxThreads).where(eq(s.inboxThreads.externalId, "c1"));
    expect(thread).toMatchObject({ participant: "@priya.eats", unread: true, preview: "Yes! Order on our site." });
    const msgs = await db.select().from(s.inboxMessages).where(eq(s.inboxMessages.threadId, thread.id));
    expect(msgs.map((m) => m.direction).sort()).toEqual(["in", "out"]);
  });

  it("reopens a done thread when the person writes again, and skips comments the account wrote", async () => {
    const [thread] = await db.select().from(s.inboxThreads).where(eq(s.inboxThreads.externalId, "c1"));
    await db.update(s.inboxThreads).set({ done: true, unread: false }).where(eq(s.inboxThreads.id, thread.id));
    const more = [
      { externalId: "c1", author: "@priya.eats", text: "Delivery in Saket?", at: at(8), replies: [{ externalId: "r2", author: "@priya.eats", text: "Thanks, ordered!", at: at(10) }] },
      { externalId: "c2", author: "@cafe.delhi", text: "Our own note", at: at(10), replies: [] },
    ];
    await withOrg(db, account.orgId, (tx) => storeComments(tx, account, null, more));
    const [after] = await db.select().from(s.inboxThreads).where(eq(s.inboxThreads.id, thread.id));
    expect(after).toMatchObject({ done: false, unread: true });
    expect(await db.select().from(s.inboxThreads).where(eq(s.inboxThreads.externalId, "c2"))).toHaveLength(0);
  });

  it("adds sample conversations on recent posts", async () => {
    let [acc] = await db.select().from(s.socialAccounts).where(eq(s.socialAccounts.spaceId, account.spaceId));
    if (!acc) [acc] = await db.insert(s.socialAccounts).values({ orgId: account.orgId, spaceId: account.spaceId, platform: "instagram", handle: "@cafe.delhi" }).returning();
    await db.insert(s.posts).values({ orgId: account.orgId, spaceId: account.spaceId, socialAccountId: acc.id, externalId: "recent-1", publishedAt: new Date(), format: "reel", title: "Recent reel" });
    const added = await withOrg(db, account.orgId, (tx) => addSampleConversations(tx, account.orgId, account.spaceId));
    expect(added).toBeGreaterThan(0);
    const samples = await db.select().from(s.inboxThreads).where(eq(s.inboxThreads.sample, true));
    expect(samples.every((t) => t.postId)).toBe(true);
  });
});

describe("Graph comments", () => {
  const scripted = (body: unknown, calls: { url: URL; method: string; body: string }[]) =>
    (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: String(init?.body ?? "") });
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

  it("reads Instagram comments with replies and replies under a comment", async () => {
    const calls: { url: URL; method: string; body: string }[] = [];
    const g = createGraph({ appId: "a", appSecret: "b" }, scripted({ data: [{ id: "c1", text: "Hi", username: "priya", timestamp: "2026-10-06T08:00:00+0000", replies: { data: [{ id: "r1", text: "Hello", username: "cafe.delhi", timestamp: "2026-10-06T09:00:00+0000" }] } }] }, calls));
    const list = await g.listComments("instagram", "m1", "tok");
    expect(list[0]).toMatchObject({ externalId: "c1", author: "@priya", text: "Hi", replies: [{ externalId: "r1", author: "@cafe.delhi" }] });
    expect(calls[0].url.pathname).toMatch(/\/m1\/comments$/);
    expect(calls[0].url.searchParams.get("fields")).toContain("replies");

    const calls2: { url: URL; method: string; body: string }[] = [];
    const g2 = createGraph({ appId: "a", appSecret: "b" }, scripted({ id: "r9" }, calls2));
    expect(await g2.replyToComment("instagram", "c1", "Thanks!", "tok")).toEqual({ id: "r9" });
    expect(calls2[0]).toMatchObject({ method: "POST" });
    expect(calls2[0].url.pathname).toMatch(/\/c1\/replies$/);
    expect(new URLSearchParams(calls2[0].body).get("message")).toBe("Thanks!");
  });

  it("replies to Facebook comments with a comment on the comment", async () => {
    const calls: { url: URL; method: string; body: string }[] = [];
    const g = createGraph({ appId: "a", appSecret: "b" }, scripted({ id: "fbr" }, calls));
    await g.replyToComment("facebook", "post_c1", "Thanks!", "tok");
    expect(calls[0].url.pathname).toMatch(/\/post_c1\/comments$/);
  });
});
