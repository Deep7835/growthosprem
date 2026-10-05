import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentItems, placements, projects, statuses, taskComments, tasks, users } from "@/db/schema";
import { PLACEMENTS, type PlacementKind, type Platform } from "@/lib/placements";
import { cleanChecklist, formatForPlacements, isDoneCategory, planTemplate, TASK_TEMPLATES, type ChecklistItem, type Priority, type TemplateFormat } from "@/lib/tasks";
import { mentionedIn } from "@/notifications/content";
import { deliver } from "@/notifications/deliver";
import { logActivity } from "./activity";
import { assignableMembers } from "./table";
import type { SpaceContext } from "./tenancy";

// Tasks (PRD 6.8). Everyone who can edit content in a space can create, edit and complete tasks.

export interface TaskRow {
  id: string;
  title: string;
  statusId: string | null;
  done: boolean;
  priority: Priority;
  assigneeId: string | null;
  dueAt: string | null;
  checklistDone: number;
  checklistTotal: number;
  comments: number;
  parent: { kind: "content" | "project" | "space"; id: string | null; title: string };
  platforms: Platform[];
  position: number;
  updatedAt: string;
}

const actor = (ctx: SpaceContext) => ({ kind: "user" as const, userId: ctx.user.id, name: ctx.user.name });
const href = (ctx: SpaceContext, taskId: string) => `/o/${ctx.org.slug}/s/${ctx.space.slug}/board?task=${taskId}`;

export async function taskStatuses(tx: Tx, spaceId: string) {
  return tx
    .select()
    .from(statuses)
    .where(and(eq(statuses.spaceId, spaceId), eq(statuses.appliesTo, "task")))
    .orderBy(asc(statuses.position));
}

async function taskIn(tx: Tx, ctx: SpaceContext, id: string) {
  const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.spaceId, ctx.space.id)));
  if (!task) throw new Error("That task isn’t in this space any more.");
  return task;
}

/** Board and Table (TK-02): every task in the space with what the cards show. */
export async function listTasks(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [rows, statusList, members, projectList] = await Promise.all([
      tx.select().from(tasks).where(eq(tasks.spaceId, ctx.space.id)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
      taskStatuses(tx, ctx.space.id),
      assignableMembers(tx, ctx),
      tx.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.spaceId, ctx.space.id), isNull(projects.archivedAt))),
    ]);
    const contentIds = [...new Set(rows.map((t) => t.contentItemId).filter((x): x is string => Boolean(x)))];
    const [posts, pl, counts] = await Promise.all([
      contentIds.length ? tx.select({ id: contentItems.id, title: contentItems.title, archivedAt: contentItems.archivedAt }).from(contentItems).where(inArray(contentItems.id, contentIds)) : [],
      contentIds.length ? tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, contentIds)) : [],
      rows.length ? tx.select({ taskId: taskComments.taskId }).from(taskComments).where(inArray(taskComments.taskId, rows.map((r) => r.id))) : [],
    ]);
    const visible = rows.filter((t) => !t.contentItemId || !posts.find((p) => p.id === t.contentItemId)?.archivedAt);
    const list: TaskRow[] = visible.map((t) => {
      const post = posts.find((p) => p.id === t.contentItemId);
      const project = projectList.find((p) => p.id === t.projectId);
      return {
        id: t.id,
        title: t.title,
        statusId: t.statusId,
        done: t.done,
        priority: t.priority,
        assigneeId: t.assigneeId,
        dueAt: t.dueAt?.toISOString() ?? null,
        checklistDone: t.checklist.filter((c) => c.done).length,
        checklistTotal: t.checklist.length,
        comments: counts.filter((c) => c.taskId === t.id).length,
        parent: post ? { kind: "content", id: post.id, title: post.title } : project ? { kind: "project", id: project.id, title: project.name } : { kind: "space", id: null, title: ctx.space.name },
        platforms: [...new Set(pl.filter((p) => p.contentItemId === t.contentItemId).map((p) => PLACEMENTS[p.kind as PlacementKind].platform))],
        position: t.position,
        updatedAt: t.updatedAt.toISOString(),
      };
    });
    return {
      tasks: list,
      statuses: statusList.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category })),
      members,
      projects: projectList,
    };
  });
}

export type TaskList = Awaited<ReturnType<typeof listTasks>>;

/** The task panel: everything about one task. */
export async function getTask(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.spaceId, ctx.space.id)));
    if (!task) return null;
    const [statusList, members, commentRows, post, project, creator] = await Promise.all([
      taskStatuses(tx, ctx.space.id),
      assignableMembers(tx, ctx),
      tx
        .select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, authorId: taskComments.authorUserId, authorName: users.name })
        .from(taskComments)
        .leftJoin(users, eq(users.id, taskComments.authorUserId))
        .where(eq(taskComments.taskId, task.id))
        .orderBy(asc(taskComments.createdAt)),
      task.contentItemId ? tx.select({ id: contentItems.id, title: contentItems.title, scheduledAt: contentItems.scheduledAt }).from(contentItems).where(eq(contentItems.id, task.contentItemId)).then((r) => r[0] ?? null) : null,
      task.projectId ? tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, task.projectId)).then((r) => r[0] ?? null) : null,
      task.createdBy ? tx.select({ name: users.name }).from(users).where(eq(users.id, task.createdBy)).then((r) => r[0] ?? null) : null,
    ]);
    return {
      task: { ...task, dueAt: task.dueAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() },
      statuses: statusList.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category })),
      members,
      comments: commentRows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), authorId: c.authorId, authorName: c.authorName ?? "Former member" })),
      post: post && { id: post.id, title: post.title, scheduledAt: post.scheduledAt?.toISOString() ?? null },
      project,
      createdByName: creator?.name ?? null,
    };
  });
}

export type TaskDetail = NonNullable<Awaited<ReturnType<typeof getTask>>>;

async function checkAssignee(tx: Tx, ctx: SpaceContext, assigneeId: string | null) {
  if (!assigneeId) return;
  const allowed = await assignableMembers(tx, ctx);
  if (!allowed.some((m) => m.id === assigneeId)) throw new Error("Only people in this space can be assigned.");
}

async function notifyAssigned(tx: Tx, ctx: SpaceContext, task: { id: string; title: string; assigneeId: string | null; dueAt: Date | null }) {
  if (!task.assigneeId || task.assigneeId === ctx.user.id) return;
  const due = task.dueAt
    ? ` · due ${new Intl.DateTimeFormat("en-IN", { timeZone: ctx.space.timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(task.dueAt)}`
    : "";
  await deliver(tx, [task.assigneeId], {
    orgId: ctx.org.id,
    spaceId: ctx.space.id,
    kind: "task_assigned",
    title: `${ctx.user.name} assigned you “${task.title}”`,
    body: `${ctx.space.name}${due}`,
    href: href(ctx, task.id),
  });
}

/** The first status in a category, for new tasks and the done checkbox. */
function statusFor(list: { id: string; category: string }[], done: boolean) {
  return (list.find((s) => s.category === (done ? "completed" : "not_started")) ?? list.find((s) => isDoneCategory(s.category) === done))?.id ?? null;
}

export interface NewTask {
  title: string;
  contentItemId?: string | null;
  projectId?: string | null;
  statusId?: string | null;
  assigneeId?: string | null;
  dueAt?: Date | null;
  priority?: Priority;
}

export async function createTask(ctx: SpaceContext, input: NewTask) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error("Give the task a title.");
  return withOrg(ctx.org.id, async (tx) => {
    const list = await taskStatuses(tx, ctx.space.id);
    const status = input.statusId ? list.find((s) => s.id === input.statusId) : list.find((s) => s.id === statusFor(list, false));
    if (input.statusId && !status) throw new Error("That status isn’t a task status in this space.");
    let projectId = input.projectId ?? null;
    if (input.contentItemId) {
      const [post] = await tx.select().from(contentItems).where(and(eq(contentItems.id, input.contentItemId), eq(contentItems.spaceId, ctx.space.id)));
      if (!post) throw new Error("That post isn’t in this space.");
      projectId = post.projectId;
    } else if (projectId) {
      const [p] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.spaceId, ctx.space.id)));
      if (!p) throw new Error("That project isn’t in this space.");
    }
    await checkAssignee(tx, ctx, input.assigneeId ?? null);
    const [{ top }] = await tx.select({ top: max(tasks.position) }).from(tasks).where(eq(tasks.spaceId, ctx.space.id));
    const [task] = await tx
      .insert(tasks)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        contentItemId: input.contentItemId ?? null,
        projectId,
        title,
        statusId: status?.id ?? null,
        done: status ? isDoneCategory(status.category) : false,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        priority: input.priority ?? "medium",
        position: (top ?? 0) + 1,
        createdBy: ctx.user.id,
      })
      .returning();
    if (task.contentItemId) await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: task.contentItemId, actor: actor(ctx), action: `added task “${title}”` });
    await notifyAssigned(tx, ctx, task);
    return task;
  });
}

export interface TaskPatch {
  title?: string;
  description?: string;
  statusId?: string;
  done?: boolean;
  assigneeId?: string | null;
  dueAt?: Date | null;
  priority?: Priority;
  checklist?: ChecklistItem[];
  position?: number;
}

export async function updateTask(ctx: SpaceContext, id: string, patch: TaskPatch) {
  await withOrg(ctx.org.id, async (tx) => {
    const task = await taskIn(tx, ctx, id);
    const set: Partial<typeof tasks.$inferInsert> = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, 200);
      if (!title) throw new Error("A task needs a title.");
      set.title = title;
    }
    if (patch.description !== undefined) set.description = patch.description.slice(0, 10_000);
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.dueAt !== undefined) set.dueAt = patch.dueAt;
    if (patch.checklist !== undefined) set.checklist = cleanChecklist(patch.checklist);
    if (patch.position !== undefined) set.position = patch.position;
    if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
      await checkAssignee(tx, ctx, patch.assigneeId);
      set.assigneeId = patch.assigneeId;
    }
    if (patch.statusId !== undefined || patch.done !== undefined) {
      const list = await taskStatuses(tx, ctx.space.id);
      const target = patch.statusId !== undefined ? list.find((s) => s.id === patch.statusId) : list.find((s) => s.id === statusFor(list, patch.done!));
      if (!target) throw new Error("That status isn’t a task status in this space.");
      set.statusId = target.id;
      set.done = isDoneCategory(target.category);
    }
    if (Object.keys(set).length === 0) return;
    set.updatedAt = new Date();
    const [next] = await tx.update(tasks).set(set).where(eq(tasks.id, task.id)).returning();
    if (task.contentItemId && set.done !== undefined && set.done !== task.done) {
      await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: task.contentItemId, actor: actor(ctx), action: `${set.done ? "completed" : "reopened"} task “${next.title}”` });
    }
    if (set.assigneeId !== undefined) await notifyAssigned(tx, ctx, next);
  });
}

export async function deleteTask(ctx: SpaceContext, id: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const task = await taskIn(tx, ctx, id);
    await tx.delete(tasks).where(eq(tasks.id, task.id));
    if (task.contentItemId) await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: task.contentItemId, actor: actor(ctx), action: `deleted task “${task.title}”` });
  });
}

/** A comment on a task: @mentions, then the assignee and creator, hear about it. */
export async function addTaskComment(ctx: SpaceContext, id: string, body: string) {
  const text = body.trim().slice(0, 5000);
  if (!text) throw new Error("Write something first.");
  await withOrg(ctx.org.id, async (tx) => {
    const task = await taskIn(tx, ctx, id);
    await tx.insert(taskComments).values({ orgId: ctx.org.id, taskId: task.id, authorUserId: ctx.user.id, body: text });
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, task.id));
    const event = { orgId: ctx.org.id, spaceId: ctx.space.id, body: text.slice(0, 280), href: href(ctx, task.id) };
    const mentioned = mentionedIn(text, await assignableMembers(tx, ctx)).filter((u) => u !== ctx.user.id);
    await deliver(tx, mentioned, { ...event, kind: "mention", title: `${ctx.user.name} mentioned you on the task “${task.title}”` });
    const earlier = await tx.select({ id: taskComments.authorUserId }).from(taskComments).where(eq(taskComments.taskId, task.id));
    const others = [task.assigneeId, task.createdBy, ...earlier.map((e) => e.id)].filter((u): u is string => Boolean(u) && u !== ctx.user.id && !mentioned.includes(u!));
    await deliver(tx, others, { ...event, kind: "task_comment", title: `${ctx.user.name} commented on the task “${task.title}”` });
  });
}

/**
 * TK-04: adds the template's steps to a post, due dates counted back from its publish date.
 * Steps it already has are skipped. Returns how many were added.
 */
export async function applyTemplate(ctx: SpaceContext, contentItemId: string, format?: TemplateFormat, assigneeId?: string | null) {
  return withOrg(ctx.org.id, async (tx) => {
    const [post] = await tx.select().from(contentItems).where(and(eq(contentItems.id, contentItemId), eq(contentItems.spaceId, ctx.space.id)));
    if (!post) throw new Error("That post isn’t in this space.");
    await checkAssignee(tx, ctx, assigneeId ?? null);
    const kinds = (await tx.select({ kind: placements.kind }).from(placements).where(eq(placements.contentItemId, post.id))).map((p) => p.kind as PlacementKind);
    const chosen = format ?? formatForPlacements(kinds);
    const existing = await tx.select({ title: tasks.title, templateKey: tasks.templateKey }).from(tasks).where(eq(tasks.contentItemId, post.id));
    const steps = planTemplate(chosen, post.scheduledAt, new Date(), existing);
    if (steps.length === 0) return { added: 0, format: chosen };
    const list = await taskStatuses(tx, ctx.space.id);
    const todo = statusFor(list, false);
    const [{ top }] = await tx.select({ top: max(tasks.position) }).from(tasks).where(eq(tasks.spaceId, ctx.space.id));
    const added = await tx
      .insert(tasks)
      .values(
        steps.map((s, i) => ({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          contentItemId: post.id,
          projectId: post.projectId,
          title: s.title,
          dueAt: s.dueAt,
          statusId: todo,
          templateKey: s.templateKey,
          assigneeId: assigneeId ?? null,
          position: (top ?? 0) + 1 + i,
          createdBy: ctx.user.id,
        })),
      )
      .returning();
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: post.id, actor: actor(ctx), action: `added ${added.length} tasks from the ${TASK_TEMPLATES[chosen].label} template` });
    if (assigneeId && assigneeId !== ctx.user.id) {
      await deliver(tx, [assigneeId], {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        kind: "task_assigned",
        title: `${ctx.user.name} assigned you ${added.length} tasks on “${post.title}”`,
        body: added.map((t) => t.title).join(", "),
        href: `/o/${ctx.org.slug}/s/${ctx.space.slug}/board?content=${post.id}`,
      });
    }
    return { added: added.length, format: chosen };
  });
}

/** Overview widgets (TK-02, OV-03): open tasks across the spaces the person can see. */
export async function overviewTasks(orgId: string, spaceIds: string[], userId: string, now: Date) {
  if (spaceIds.length === 0) return { byStatus: [], byAssignee: [], overdue: [], mine: [] };
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ task: tasks, statusName: statuses.name, statusColor: statuses.color, category: statuses.category, assignee: users.name })
      .from(tasks)
      .leftJoin(statuses, eq(statuses.id, tasks.statusId))
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .leftJoin(contentItems, eq(contentItems.id, tasks.contentItemId))
      .where(and(inArray(tasks.spaceId, spaceIds), isNull(contentItems.archivedAt)))
      .orderBy(asc(tasks.dueAt), desc(tasks.createdAt));
    const byStatus = new Map<string, { name: string; color: string; count: number }>();
    const byAssignee = new Map<string, { name: string; open: number; overdue: number }>();
    for (const r of rows) {
      const key = r.statusName ?? "No status";
      const s = byStatus.get(key) ?? { name: key, color: r.statusColor ?? "#9CA3AF", count: 0 };
      s.count++;
      byStatus.set(key, s);
      if (r.task.done) continue;
      const who = r.task.assigneeId ?? "none";
      const a = byAssignee.get(who) ?? { name: r.assignee ?? "Unassigned", open: 0, overdue: 0 };
      a.open++;
      if (r.task.dueAt && r.task.dueAt < now) a.overdue++;
      byAssignee.set(who, a);
    }
    const open = rows.filter((r) => !r.task.done);
    const pick = (r: (typeof rows)[number]) => ({ id: r.task.id, title: r.task.title, spaceId: r.task.spaceId, dueAt: r.task.dueAt?.toISOString() ?? null, assignee: r.assignee });
    return {
      byStatus: [...byStatus.values()],
      byAssignee: [...byAssignee.values()].sort((a, b) => b.open - a.open),
      overdue: open.filter((r) => r.task.dueAt && r.task.dueAt < now).slice(0, 8).map(pick),
      mine: open.filter((r) => r.task.assigneeId === userId).slice(0, 8).map(pick),
    };
  });
}

export const newChecklistId = () => randomUUID().slice(0, 8);

/** The post panel's Tasks section (CT-04): its tasks, who can take them and the template that fits. */
export async function tasksForPost(ctx: SpaceContext, contentItemId: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [post] = await tx.select().from(contentItems).where(and(eq(contentItems.id, contentItemId), eq(contentItems.spaceId, ctx.space.id)));
    if (!post) return null;
    const [rows, members, kinds] = await Promise.all([
      tx.select().from(tasks).where(eq(tasks.contentItemId, post.id)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
      assignableMembers(tx, ctx),
      tx.select({ kind: placements.kind }).from(placements).where(eq(placements.contentItemId, post.id)),
    ]);
    const format = formatForPlacements(kinds.map((k) => k.kind as PlacementKind));
    const missing = (f: TemplateFormat) => planTemplate(f, post.scheduledAt, new Date(ctx.requestTime), rows).length;
    return {
      tasks: rows.map((t) => ({
        id: t.id,
        title: t.title,
        done: t.done,
        dueAt: t.dueAt?.toISOString() ?? null,
        assigneeId: t.assigneeId,
        priority: t.priority,
        checklistDone: t.checklist.filter((c) => c.done).length,
        checklistTotal: t.checklist.length,
      })),
      members,
      format,
      templates: (Object.keys(TASK_TEMPLATES) as TemplateFormat[]).map((f) => ({ id: f, label: TASK_TEMPLATES[f].label, missing: missing(f) })),
      scheduled: Boolean(post.scheduledAt),
    };
  });
}

export type PostTasks = NonNullable<Awaited<ReturnType<typeof tasksForPost>>>;
