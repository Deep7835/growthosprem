import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { purgeDeletedSpaces } from "@/spaces/purge";
import { addToSpace, createSpace, deleteSpace, listSpacesForAdmin, removeFromSpace, restoreDeletedSpace, setSpaceArchived, spaceMemberList, updateSpace } from "./spaces";
import type { OrgContext, SpaceContext } from "./tenancy";

let db: Db;
let owner: OrgContext;
let manager: OrgContext;
let ids: Record<"prem" | "rahul" | "riya", string>;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [org] = await db.select().from(s.organizations);
  const users = await db.select().from(s.users);
  const u = (e: string) => users.find((x) => x.email === e)!;
  ids = { prem: u("prem@example.com").id, rahul: u("rahul@example.com").id, riya: u("riya@example.com").id };
  owner = { org, user: u("prem@example.com"), role: "owner", requestTime: Date.now() } as unknown as OrgContext;
  manager = { ...owner, user: u("rahul@example.com"), role: "manager" } as OrgContext;
}, 60_000);

const spaceCtx = async (slug: string, base: OrgContext) => {
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, slug));
  return { ...base, space, project: null, can: () => true } as unknown as SpaceContext;
};

describe("spaces (PRD 6.3)", () => {
  it("creates a space from a template with members, a unique slug and task statuses (SP-01)", async () => {
    const a = await createSpace(owner, { name: "Cafe", color: "#7FC8A9", timezone: "Asia/Kolkata", memberIds: [ids.riya, ids.prem], statuses: { template: "simple" } });
    expect(a.slug).toBe("cafe-2");
    const st = await db.select().from(s.statuses).where(eq(s.statuses.spaceId, a.id));
    expect(st.filter((x) => x.appliesTo === "content").map((x) => x.name)).toEqual(["To do", "Doing", "Done", "Archived"]);
    expect(st.filter((x) => x.appliesTo === "task")).toHaveLength(4);
    // Owners are in every space anyway, so only Riya is added.
    expect((await db.select().from(s.spaceMembers).where(eq(s.spaceMembers.spaceId, a.id))).map((m) => m.userId)).toEqual([ids.riya]);
    await expect(createSpace(manager, { name: "Nope", color: "#7FC8A9", timezone: "Asia/Kolkata", memberIds: [], statuses: { template: "default" } })).rejects.toThrow(/Owner and Admins/);
  });

  it("copies statuses from another space", async () => {
    const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
    const b = await createSpace(owner, { name: "Jewellers", color: "#F2A93B", timezone: "Asia/Dubai", memberIds: [], statuses: { copyFrom: cafe.id } });
    const names = (await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, b.id), eq(s.statuses.appliesTo, "content")))).map((x) => x.name);
    expect(names).toContain("Client review");
    expect(b.timezone).toBe("Asia/Dubai");
  });

  it("saves the Space tab, keeping at least one platform (SP-03)", async () => {
    const ctx = await spaceCtx("jewellers", owner);
    await updateSpace(ctx, { name: "Sharma Jewellers", platformColors: { instagram: "#4a3aa7", facebook: "not a colour" }, hiddenPlatforms: ["linkedin"] });
    const [row] = await db.select().from(s.spaces).where(eq(s.spaces.id, ctx.space.id));
    expect(row).toMatchObject({ name: "Sharma Jewellers", platformColors: { instagram: "#4a3aa7" }, hiddenPlatforms: ["linkedin"] });
    await expect(updateSpace(ctx, { hiddenPlatforms: ["instagram", "facebook", "linkedin"] })).rejects.toThrow(/at least one/);
  });

  it("archiving pauses scheduled posts and restoring brings the space back (SP-05)", async () => {
    const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
    const before = await db.select().from(s.contentItems).where(and(eq(s.contentItems.spaceId, cafe.id), eq(s.contentItems.publishState, "scheduled")));
    expect(before.length).toBeGreaterThan(0);
    expect(await setSpaceArchived(owner, cafe.id, true)).toBe(before.length);
    const after = await db.select().from(s.placements).where(eq(s.placements.contentItemId, before[0].id));
    expect(after.every((p) => p.state === "draft")).toBe(true);
    expect((await listSpacesForAdmin(owner)).find((x) => x.id === cafe.id)?.archived).toBe(true);
    await setSpaceArchived(owner, cafe.id, false);
  });

  it("deletes after the exact name, lets only the Owner restore, then purges after 30 days (SP-06)", async () => {
    const [j] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "jewellers"));
    await expect(deleteSpace(owner, j.id, "sharma jewellers")).rejects.toThrow(/exactly/);
    await deleteSpace(owner, j.id, "Sharma Jewellers");
    expect((await listSpacesForAdmin({ ...owner, role: "admin" } as OrgContext)).some((x) => x.id === j.id)).toBe(false);
    expect((await listSpacesForAdmin(owner)).find((x) => x.id === j.id)?.daysLeft).toBe(30);
    await expect(restoreDeletedSpace({ ...owner, role: "admin" } as OrgContext, j.id)).rejects.toThrow(/Only the Owner/);
    await restoreDeletedSpace(owner, j.id);
    await deleteSpace(owner, j.id, "Sharma Jewellers");
    expect(await purgeDeletedSpaces(db, new Date())).toBe(0);
    expect(await purgeDeletedSpaces(db, new Date(Date.now() + 31 * 864e5))).toBe(1);
    expect(await db.select().from(s.spaces).where(eq(s.spaces.id, j.id))).toHaveLength(0);
  });

  it("adds and removes members, unassigning their open work (Members tab)", async () => {
    const ctx = await spaceCtx("real-estate", owner);
    await addToSpace(ctx, [ids.riya]);
    const [status] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, ctx.space.id), eq(s.statuses.appliesTo, "content")));
    const [post] = await db.insert(s.contentItems).values({ orgId: owner.org.id, spaceId: ctx.space.id, title: "Site visit", statusId: status.id }).returning();
    await db.insert(s.contentAssignees).values({ orgId: owner.org.id, contentItemId: post.id, userId: ids.riya });
    await db.insert(s.tasks).values({ orgId: owner.org.id, spaceId: ctx.space.id, title: "Photos", assigneeId: ids.riya });
    expect((await spaceMemberList(ctx)).members.map((m) => m.name)).toContain("Riya");
    expect(await removeFromSpace(ctx, ids.riya)).toEqual({ tasks: 1, posts: 1 });
    expect((await spaceMemberList(ctx)).addable.map((m) => m.name)).toContain("Riya");
    await expect(removeFromSpace(ctx, ids.prem)).rejects.toThrow(/every space/);
  });
});
