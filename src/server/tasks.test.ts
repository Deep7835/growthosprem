import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { addTaskComment, applyTemplate, createTask, getTask, listTasks, tasksForPost, updateTask } from "./tasks";
import type { SpaceContext } from "./tenancy";

let db: Db;
let rahul: SpaceContext;
let riyaId: string;
let premId: string;
let postId: string;
let otherSpacePost: string;

const ctxFor = async (email: string, slug = "cafe") => {
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, slug));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, space.orgId));
  return { org, space, user, role: "manager", requestTime: Date.now(), can: () => true } as unknown as SpaceContext;
};

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  rahul = await ctxFor("rahul@example.com");
  [{ id: riyaId }] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, "riya@example.com"));
  [{ id: premId }] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, "prem@example.com"));
  const [post] = await db.select().from(s.contentItems).where(eq(s.contentItems.title, "Behind the scenes in the kitchen"));
  postId = post.id;
  const [re] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "real-estate"));
  const [status] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, re.id), eq(s.statuses.appliesTo, "content")));
  [{ id: otherSpacePost }] = await db.insert(s.contentItems).values({ orgId: re.orgId, spaceId: re.id, title: "Site visit", statusId: status.id }).returning();
  await db.delete(s.notifications);
}, 60_000);

const notes = (userId: string, kind: string) => db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.kind, kind)));

describe("tasks (TK-01)", () => {
  it("every space has its own task statuses, separate from content", async () => {
    const data = await listTasks(rahul);
    expect(data.statuses.map((x) => x.name)).toEqual(["To do", "Doing", "Done", "Won’t do"]);
    expect(data.tasks.filter((t) => t.parent.title === "Barista day in life")).toHaveLength(4);
  });

  it("creates a task in To do and tells the assignee", async () => {
    const task = await createTask(rahul, { title: "Book the kitchen shoot", contentItemId: postId, assigneeId: riyaId, priority: "high" });
    const data = await listTasks(rahul);
    const row = data.tasks.find((t) => t.id === task.id)!;
    expect(data.statuses.find((x) => x.id === row.statusId)?.name).toBe("To do");
    expect(row.parent).toMatchObject({ kind: "content", title: "Behind the scenes in the kitchen" });
    expect(await notes(riyaId, "task_assigned")).toHaveLength(1);
  });

  it("keeps done in step with the status, both ways", async () => {
    const [task] = await db.select().from(s.tasks).where(eq(s.tasks.title, "Book the kitchen shoot"));
    await updateTask(rahul, task.id, { done: true });
    let detail = (await getTask(rahul, task.id))!;
    expect(detail.task.done).toBe(true);
    expect(detail.statuses.find((x) => x.id === detail.task.statusId)?.name).toBe("Done");
    const doing = detail.statuses.find((x) => x.name === "Doing")!;
    await updateTask(rahul, task.id, { statusId: doing.id, checklist: [{ id: "a", text: "Ask chef", done: true }] });
    detail = (await getTask(rahul, task.id))!;
    expect(detail.task.done).toBe(false);
    expect(detail.task.checklist).toEqual([{ id: "a", text: "Ask chef", done: true }]);
  });

  it("refuses posts, statuses and people from outside the space", async () => {
    await expect(createTask(rahul, { title: "x", contentItemId: otherSpacePost })).rejects.toThrow(/isn’t in this space/);
    const [contentStatus] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, rahul.space.id), eq(s.statuses.appliesTo, "content")));
    await expect(createTask(rahul, { title: "x", statusId: contentStatus.id })).rejects.toThrow(/task status/);
    const neha = await db.select().from(s.users).where(eq(s.users.email, "neha@example.com"));
    await expect(createTask(rahul, { title: "x", assigneeId: neha[0].id })).rejects.toThrow(/Only people in this space/);
  });

  it("comments notify @mentions, then the assignee and creator", async () => {
    const [task] = await db.select().from(s.tasks).where(eq(s.tasks.title, "Book the kitchen shoot"));
    await addTaskComment(rahul, task.id, "@Prem can you approve the budget?");
    expect(await notes(premId, "mention")).toHaveLength(1);
    expect(await notes(riyaId, "task_comment")).toHaveLength(1);
    expect((await getTask(rahul, task.id))!.comments[0].body).toBe("@Prem can you approve the budget?");
  });
});

describe("templates (TK-04)", () => {
  it("adds a Reel's steps once, due dates counted back from the publish date", async () => {
    const first = await applyTemplate(rahul, postId, undefined, riyaId);
    expect(first).toEqual({ added: 6, format: "reel" });
    expect((await applyTemplate(rahul, postId)).added).toBe(0);
    const rows = await db.select().from(s.tasks).where(and(eq(s.tasks.contentItemId, postId), eq(s.tasks.title, "Publish")));
    const [post] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, postId));
    expect(rows[0].dueAt?.getTime()).toBe(post.scheduledAt!.getTime());
    const panel = (await tasksForPost(rahul, postId))!;
    expect(panel.format).toBe("reel");
    expect(panel.templates.find((t) => t.id === "reel")?.missing).toBe(0);
    expect(panel.tasks).toHaveLength(7);
  });
});
