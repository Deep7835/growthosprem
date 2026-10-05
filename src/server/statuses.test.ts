import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { addStatus, deleteStatus, importStatuses, loadStatuses, moveStatus, updateStatus } from "./statuses";
import type { SpaceContext } from "./tenancy";

let db: Db;
let ctx: SpaceContext;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, space.orgId));
  ctx = { org, space, user, role: "owner", project: null, requestTime: Date.now(), can: () => true } as unknown as SpaceContext;
}, 60_000);

const byName = async (name: string, kind: "content" | "task" = "content") => (await loadStatuses(ctx))[kind].find((x) => x.name === name)!;

describe("statuses (PRD 6.4)", () => {
  it("adds a status at the end of its category and reorders within it", async () => {
    await addStatus(ctx, "content", { name: "Shoot booked", color: "#60A5FA", category: "active" });
    let names = (await loadStatuses(ctx)).content.map((x) => x.name);
    expect(names.indexOf("Shoot booked")).toBe(names.indexOf("Changes requested") + 1);
    await moveStatus(ctx, (await byName("Shoot booked")).id, -1);
    names = (await loadStatuses(ctx)).content.map((x) => x.name);
    expect(names.indexOf("Shoot booked")).toBe(names.indexOf("Changes requested") - 1);
    await expect(addStatus(ctx, "content", { name: "shoot booked", color: "#000000", category: "active" })).rejects.toThrow(/already/);
  });

  it("keeps one status per category (ST-01)", async () => {
    const closed = await byName("Closed");
    await expect(deleteStatus(ctx, closed.id, null)).rejects.toThrow(/at least one/);
    await expect(updateStatus(ctx, closed.id, { category: "active" })).rejects.toThrow(/at least one/);
  });

  it("asks where posts go before deleting a status in use (ST-05)", async () => {
    const review = await byName("Client review");
    expect(review.used).toBeGreaterThan(0);
    await expect(deleteStatus(ctx, review.id, null)).rejects.toThrow(/Choose where/);
    const internal = await byName("Internal review");
    await deleteStatus(ctx, review.id, internal.id);
    expect((await byName("Internal review")).used).toBeGreaterThanOrEqual(review.used);
  });

  it("gives each client review step to one status", async () => {
    const internal = await byName("Internal review");
    await updateStatus(ctx, internal.id, { reviewRole: "in_review" });
    const all = (await loadStatuses(ctx)).content.filter((x) => x.reviewRole === "in_review");
    expect(all.map((x) => x.name)).toEqual(["Internal review"]);
  });

  it("imports a template, moving work by name then category (ST-04)", async () => {
    const before = await db.select().from(s.contentItems).where(eq(s.contentItems.spaceId, ctx.space.id));
    await importStatuses(ctx, "content", { template: "default" });
    const after = await loadStatuses(ctx);
    expect(after.content.map((x) => x.name)).toEqual(["Idea", "In progress", "Pending", "Approved", "Closed"]);
    expect(after.content.reduce((n, x) => n + x.used, 0)).toBe(before.length);
    expect(after.content.find((x) => x.name === "Pending")?.reviewRole).toBe("in_review");
  });

  it("keeps tasks' done flag in step when a task status changes category", async () => {
    await addStatus(ctx, "task", { name: "Waiting", color: "#A78BFA", category: "active" });
    const doing = await byName("Doing", "task");
    const [task] = await db.insert(s.tasks).values({ orgId: ctx.org.id, spaceId: ctx.space.id, title: "Check", statusId: doing.id }).returning();
    await updateStatus(ctx, doing.id, { category: "completed" });
    const [row] = await db.select().from(s.tasks).where(and(eq(s.tasks.id, task.id)));
    expect(row.done).toBe(true);
  });
});
