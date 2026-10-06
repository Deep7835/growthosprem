import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { readFilters } from "./notifications";
import { loadDashboard } from "./overview";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
}, 60_000);

describe("overview dashboard", () => {
  it("counts posts per space and category, and finds overdue posts and tasks", async () => {
    const [org] = await db.select().from(s.organizations);
    const spaces = await db.select().from(s.spaces).where(eq(s.spaces.orgId, org.id));
    const [prem] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
    const cafe = spaces.find((x) => x.slug === "cafe")!;
    const [idea] = await db.select().from(s.statuses).where(eq(s.statuses.spaceId, cafe.id));
    const past = new Date(Date.now() - 3 * 864e5);
    const [late] = await db.insert(s.contentItems).values({ orgId: org.id, spaceId: cafe.id, title: "Late post", statusId: idea.id, scheduledAt: past }).returning();
    await db.insert(s.contentAssignees).values({ orgId: org.id, contentItemId: late.id, userId: prem.id });

    const d = await loadDashboard(org.id, spaces.map((x) => x.id), prem.id, { now: new Date(), rangeDays: 14 });
    const total = Object.values(d.contentByCategory).reduce((a, b) => a + b, 0);
    expect(Object.values(d.contentBySpace).reduce((a, b) => a + b, 0)).toBe(total);
    expect(d.overdue.some((i) => i.id === late.id && i.kind === "content")).toBe(true);
    expect(d.assigned.some((i) => i.id === late.id)).toBe(true);
    expect(d.upcoming.every((i) => i.at && Date.parse(i.at) >= Date.now() - 1000)).toBe(true);
    expect(d.spaceBreakdown.map((b) => b.spaceId).sort()).toEqual(spaces.map((x) => x.id).sort());
  });
});

describe("notification filters", () => {
  it("reads several types and spaces, and ignores unknown values", () => {
    const id = "6f0e8a52-0f5b-4c39-9e3a-2a7b1c1e9d10";
    expect(readFilters({ type: "comments,review,nope", space: `${id},none,bad` })).toMatchObject({ types: ["comments", "review"], spaces: [id, "none"], tab: "primary" });
    expect(readFilters({})).toMatchObject({ types: [], spaces: [] });
  });
});
