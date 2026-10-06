// The Overview dashboard's widgets (PRD 6.2, OV-01 to OV-03): one query pass for all of them,
// across the spaces you can see (or the ones chosen in Filters).
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { withOrg } from "@/db";
import { contentAssignees, contentItems, notes, placements, statuses, tasks, users } from "@/db/schema";

export type Category = "not_started" | "active" | "completed" | "closed";

export interface DashItem {
  kind: "content" | "task" | "note";
  id: string;
  title: string;
  spaceId: string;
  /** Planned date for posts, due date for tasks. */
  at: string | null;
  updatedAt: string;
  status: { name: string; color: string; category: Category } | null;
  platforms: string[];
  people: { id: string; name: string }[];
  excerpt?: string;
}

const OPEN: Category[] = ["not_started", "active"];

export async function loadDashboard(orgId: string, spaceIds: string[], userId: string, opts: { now: Date; rangeDays: number }) {
  const { now } = opts;
  const until = new Date(now.getTime() + opts.rangeDays * 864e5);
  const since = new Date(now.getTime() - opts.rangeDays * 864e5);
  return withOrg(orgId, async (tx) => {
    const posts = await tx
      .select({ item: contentItems, status: { name: statuses.name, color: statuses.color, category: statuses.category, reviewRole: statuses.reviewRole } })
      .from(contentItems)
      .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
      .where(and(inArray(contentItems.spaceId, spaceIds), isNull(contentItems.archivedAt)));
    const ids = posts.map((p) => p.item.id);
    const [pl, asg, taskRows, noteRows] = await Promise.all([
      ids.length ? tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, ids)) : [],
      ids.length
        ? tx.select({ contentItemId: contentAssignees.contentItemId, id: users.id, name: users.name }).from(contentAssignees).innerJoin(users, eq(users.id, contentAssignees.userId)).where(inArray(contentAssignees.contentItemId, ids))
        : [],
      tx
        .select({ task: tasks, status: { name: statuses.name, color: statuses.color, category: statuses.category }, assignee: users.name })
        .from(tasks)
        .leftJoin(statuses, eq(statuses.id, tasks.statusId))
        .leftJoin(users, eq(users.id, tasks.assigneeId))
        .leftJoin(contentItems, eq(contentItems.id, tasks.contentItemId))
        .where(and(inArray(tasks.spaceId, spaceIds), isNull(contentItems.archivedAt)))
        .orderBy(asc(tasks.dueAt)),
      tx
        .select({ id: notes.id, title: notes.title, spaceId: notes.spaceId, text: notes.text, updatedAt: notes.updatedAt })
        .from(notes)
        .where(and(inArray(notes.spaceId, spaceIds), gte(notes.updatedAt, since)))
        .orderBy(desc(notes.updatedAt))
        .limit(6),
    ]);
    const kindsOf = new Map<string, string[]>();
    for (const p of pl) kindsOf.set(p.contentItemId, [...(kindsOf.get(p.contentItemId) ?? []), p.kind]);
    const peopleOf = new Map<string, { id: string; name: string }[]>();
    for (const a of asg) peopleOf.set(a.contentItemId, [...(peopleOf.get(a.contentItemId) ?? []), { id: a.id, name: a.name }]);

    const post = (p: (typeof posts)[number]): DashItem => ({
      kind: "content",
      id: p.item.id,
      title: p.item.title,
      spaceId: p.item.spaceId,
      at: p.item.scheduledAt?.toISOString() ?? null,
      updatedAt: p.item.updatedAt.toISOString(),
      status: { name: p.status.name, color: p.status.color, category: p.status.category },
      platforms: kindsOf.get(p.item.id) ?? [],
      people: peopleOf.get(p.item.id) ?? [],
    });
    const task = (t: (typeof taskRows)[number]): DashItem => ({
      kind: "task",
      id: t.task.id,
      title: t.task.title,
      spaceId: t.task.spaceId,
      at: t.task.dueAt?.toISOString() ?? null,
      updatedAt: t.task.updatedAt.toISOString(),
      status: t.status?.name ? { name: t.status.name, color: t.status.color ?? "#9CA3AF", category: (t.status.category ?? "not_started") as Category } : null,
      platforms: [],
      people: t.task.assigneeId && t.assignee ? [{ id: t.task.assigneeId, name: t.assignee }] : [],
    });
    const byAt = (a: DashItem, b: DashItem) => (a.at ?? "").localeCompare(b.at ?? "");
    const openPost = (p: (typeof posts)[number]) => OPEN.includes(p.status.category) && !["published", "partially_published", "publishing"].includes(p.item.publishState);
    const openTasks = taskRows.filter((t) => !t.task.done);

    const count = <T,>(rows: T[], key: (r: T) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
      return Object.fromEntries(m) as Record<string, number>;
    };

    return {
      recent: [
        ...[...posts].sort((a, b) => b.item.updatedAt.getTime() - a.item.updatedAt.getTime()).slice(0, 6).map(post),
        ...noteRows.map(
          (n): DashItem => ({ kind: "note", id: n.id, title: n.title || "Untitled note", spaceId: n.spaceId, at: null, updatedAt: n.updatedAt.toISOString(), status: null, platforms: [], people: [], excerpt: n.text.slice(0, 140) }),
        ),
      ]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
      contentBySpace: count(posts, (p) => p.item.spaceId),
      contentByCategory: count(posts, (p) => p.status.category),
      tasksByCategory: count(taskRows, (t) => t.status?.category ?? "not_started"),
      tasksByAssignee: Object.entries(count(openTasks, (t) => t.assignee ?? "Unassigned"))
        .map(([name, n]) => ({ name, open: n }))
        .sort((a, b) => b.open - a.open),
      upcoming: [
        ...posts.filter((p) => p.item.scheduledAt && p.item.scheduledAt >= now && p.item.scheduledAt <= until).map(post),
        ...openTasks.filter((t) => t.task.dueAt && t.task.dueAt >= now && t.task.dueAt <= until).map(task),
      ]
        .sort(byAt)
        .slice(0, 10),
      assigned: [
        ...posts.filter((p) => openPost(p) && (peopleOf.get(p.item.id) ?? []).some((x) => x.id === userId)).map(post),
        ...openTasks.filter((t) => t.task.assigneeId === userId).map(task),
      ]
        .sort(byAt)
        .slice(0, 10),
      overdue: [
        ...posts.filter((p) => openPost(p) && p.item.scheduledAt && p.item.scheduledAt < now).map(post),
        ...openTasks.filter((t) => t.task.dueAt && t.task.dueAt < now).map(task),
      ]
        .sort(byAt)
        .slice(0, 10),
      waiting: posts.filter((p) => p.status.reviewRole === "in_review").map(post),
      publishing: {
        not_scheduled: posts.filter((p) => p.item.publishState === "not_scheduled").length,
        scheduled: posts.filter((p) => p.item.publishState === "scheduled").length,
        published: posts.filter((p) => ["published", "partially_published"].includes(p.item.publishState)).length,
        failed: posts.filter((p) => p.item.publishState === "failed").length,
      },
      spaceBreakdown: spaceIds.map((id) => ({
        spaceId: id,
        content: posts.filter((p) => p.item.spaceId === id).length,
        tasks: taskRows.filter((t) => t.task.spaceId === id).length,
      })),
      hasScheduled: posts.some((p) => p.item.scheduledAt !== null),
    };
  });
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;
