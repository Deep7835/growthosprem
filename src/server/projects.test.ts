import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { getSpaceContent } from "./content";
import { createProject, deletePreview, deleteProject, duplicateProject, listProjects, setArchived, updateProject } from "./projects";
import { createTask, listTasks } from "./tasks";
import type { SpaceContext } from "./tenancy";

let db: Db;
let ctx: SpaceContext;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "rahul@example.com"));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, space.orgId));
  ctx = { org, space, user, role: "manager", project: null, requestTime: Date.now(), can: () => true } as unknown as SpaceContext;
}, 60_000);

const folderOf = (projectId: string) => db.select().from(s.mediaFolders).where(eq(s.mediaFolders.projectId, projectId));

describe("projects (PRD 6.5)", () => {
  it("creates a project with or without its media folder", async () => {
    const a = await createProject(ctx, { name: "  Monsoon menu ", goal: "Launch 6 dishes", startsOn: "2026-07-01", endsOn: "2026-07-31", color: "#2A78D6" }, true);
    expect(a).toMatchObject({ name: "Monsoon menu", color: "#2a78d6", startsOn: "2026-07-01" });
    expect(await folderOf(a.id)).toHaveLength(1);
    const b = await createProject(ctx, { name: "Hiring" }, false);
    expect(await folderOf(b.id)).toHaveLength(0);
    await expect(createProject(ctx, { name: "Bad dates", startsOn: "2026-08-02", endsOn: "2026-08-01" }, false)).rejects.toThrow(/end date/);
  });

  it("renames the folder with the project, and duplicates settings without content", async () => {
    const [p] = await db.select().from(s.projects).where(eq(s.projects.name, "Monsoon menu"));
    await updateProject(ctx, p.id, { name: "Monsoon specials", goal: "Launch 6 dishes" });
    expect((await folderOf(p.id))[0].name).toBe("Monsoon specials");
    const copy = await duplicateProject(ctx, p.id);
    expect(copy.name).toBe("Monsoon specials (copy)");
    expect(await folderOf(copy.id)).toHaveLength(1);
    expect((await duplicateProject(ctx, p.id)).name).toBe("Monsoon specials (copy 2)");
  });

  it("filters views to the project (PJ-02) and hides archived ones from lists", async () => {
    const [diwali] = await db.select().from(s.projects).where(eq(s.projects.name, "Diwali 2026"));
    const inProject = { ...ctx, project: diwali } as SpaceContext;
    const { cards } = await getSpaceContent(inProject);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.projectName === "Diwali 2026")).toBe(true);
    await createTask(ctx, { title: "Order diya props", projectId: diwali.id });
    expect((await listTasks(inProject)).tasks.map((t) => t.title)).toContain("Order diya props");
    expect((await listTasks(inProject)).tasks.some((t) => t.parent.title === "Barista day in life")).toBe(false);
    await setArchived(ctx, diwali.id, true);
    expect((await listProjects(ctx)).find((p) => p.id === diwali.id)?.archived).toBe(true);
    await setArchived(ctx, diwali.id, false);
  });

  it("deletes only what's ticked, after the exact name (PJ-05)", async () => {
    const [diwali] = await db.select().from(s.projects).where(eq(s.projects.name, "Diwali 2026"));
    const posts = await db.select().from(s.contentItems).where(eq(s.contentItems.projectId, diwali.id));
    expect((await deletePreview(ctx, diwali.id)).usedElsewhere).toEqual([]);
    await expect(deleteProject(ctx, diwali.id, "diwali 2026", { content: false, tasks: true, notes: false, media: false })).rejects.toThrow(/exactly/);
    await deleteProject(ctx, diwali.id, "Diwali 2026", { content: false, tasks: true, notes: false, media: false });
    expect(await db.select().from(s.projects).where(eq(s.projects.id, diwali.id))).toHaveLength(0);
    // Posts stay, without a project; the project's tasks are gone; its folder stays as a plain folder.
    const kept = await db.select().from(s.contentItems).where(eq(s.contentItems.id, posts[0].id));
    expect(kept[0].projectId).toBeNull();
    expect(await db.select().from(s.tasks).where(eq(s.tasks.title, "Order diya props"))).toHaveLength(0);
    expect(await db.select().from(s.mediaFolders).where(and(eq(s.mediaFolders.name, "Diwali 2026"), eq(s.mediaFolders.spaceId, ctx.space.id)))).toHaveLength(1);
  });
});
