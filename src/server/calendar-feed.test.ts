import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { createFeed, removeFeed, renderFeed } from "./calendar-feed";
import type { OrgContext } from "./tenancy";

let db: Db;
let org: typeof s.organizations.$inferSelect;
const ctxFor = async (email: string, role: string) => {
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  return { org, user, role, requestTime: Date.now(), billing: { phase: "trial", plan: "growth", locked: false } } as unknown as OrgContext;
};

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  [org] = await db.select().from(s.organizations);
  // A planned post in each space.
  for (const slug of ["cafe", "real-estate"]) {
    const [sp] = await db.select().from(s.spaces).where(eq(s.spaces.slug, slug));
    const [st] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, sp.id), eq(s.statuses.appliesTo, "content")));
    await db.insert(s.contentItems).values({ orgId: org.id, spaceId: sp.id, title: `Feed post in ${slug}`, statusId: st.id, scheduledAt: new Date(Date.now() + 2 * 864e5) });
  }
}, 60_000);

describe("calendar feed", () => {
  it("shows every space to an Owner and only their spaces to an Editor", async () => {
    const owner = await createFeed(await ctxFor("prem@example.com", "owner"), true);
    const all = (await renderFeed(owner, "https://app.test"))!;
    expect(all).toContain("Feed post in cafe");
    expect(all).toContain("Feed post in real-estate");
    expect(all).toContain("URL:https://app.test/o/");

    const riya = await ctxFor("riya@example.com", "editor");
    const editor = await createFeed(riya, false);
    const mine = (await renderFeed(editor, "https://app.test"))!;
    expect(mine).toContain("Feed post in cafe");
    expect(mine).not.toContain("Feed post in real-estate");
    expect(mine).not.toContain("Task due");
  });

  it("stops working when replaced, turned off or unknown", async () => {
    const prem = await ctxFor("prem@example.com", "owner");
    const first = await createFeed(prem, true);
    const second = await createFeed(prem, true);
    expect(await renderFeed(first, "https://app.test")).toBeNull();
    expect(await renderFeed(second, "https://app.test")).not.toBeNull();
    await removeFeed(prem);
    expect(await renderFeed(second, "https://app.test")).toBeNull();
    expect(await renderFeed("not-a-real-token-at-all-xx", "https://app.test")).toBeNull();
  });
});
