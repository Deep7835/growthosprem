import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import {
  activityLog,
  comments,
  contentAssignees,
  contentItems,
  placements,
  projects,
  socialAccounts,
  statuses,
  tasks,
  users,
} from "@/db/schema";
import { mediaForContent } from "@/db/media";
import { mediaAssets } from "@/db/schema";
import type { PlacementKind } from "@/lib/placements";
import type { SpaceContext } from "./tenancy";

export interface CardItem {
  id: string;
  title: string;
  statusId: string;
  publishState: string;
  scheduledAt: string | null;
  projectName: string | null;
  pillar: string | null;
  kinds: PlacementKind[];
  assignees: { id: string; name: string }[];
  tasksDone: number;
  tasksTotal: number;
  /** First ready media with a thumbnail: the card's cover (VW-01). */
  coverId: string | null;
}

export async function loadContentStatuses(tx: Tx, spaceId: string) {
  return tx
    .select()
    .from(statuses)
    .where(and(eq(statuses.spaceId, spaceId), eq(statuses.appliesTo, "content")))
    .orderBy(asc(statuses.position));
}

async function loadCards(tx: Tx, spaceId: string, projectId: string | null = null): Promise<CardItem[]> {
  const items = await tx
    .select({ item: contentItems, projectName: projects.name })
    .from(contentItems)
    .leftJoin(projects, eq(projects.id, contentItems.projectId))
    .where(and(eq(contentItems.spaceId, spaceId), isNull(contentItems.archivedAt), projectId ? eq(contentItems.projectId, projectId) : undefined))
    .orderBy(asc(contentItems.position), asc(contentItems.createdAt));
  const ids = items.map((r) => r.item.id);
  if (ids.length === 0) return [];

  const [pl, asg, tk, media] = await Promise.all([
    tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, ids)),
    tx
      .select({ contentItemId: contentAssignees.contentItemId, id: users.id, name: users.name })
      .from(contentAssignees)
      .innerJoin(users, eq(users.id, contentAssignees.userId))
      .where(inArray(contentAssignees.contentItemId, ids)),
    tx.select({ contentItemId: tasks.contentItemId, done: tasks.done }).from(tasks).where(inArray(tasks.contentItemId, ids)),
    mediaForContent(tx, ids),
  ]);

  return items.map(({ item, projectName }) => {
    const itemTasks = tk.filter((t) => t.contentItemId === item.id);
    return {
      id: item.id,
      title: item.title,
      statusId: item.statusId,
      publishState: item.publishState,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      projectName,
      pillar: item.pillar,
      kinds: pl.filter((p) => p.contentItemId === item.id).map((p) => p.kind),
      assignees: asg.filter((a) => a.contentItemId === item.id).map(({ id, name }) => ({ id, name })),
      tasksDone: itemTasks.filter((t) => t.done).length,
      tasksTotal: itemTasks.length,
      coverId: media.find((m) => m.contentId === item.id && m.asset.status === "ready" && m.asset.thumbKey)?.asset.id ?? null,
    };
  });
}

export async function getSpaceContent(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [statusList, cards] = await Promise.all([loadContentStatuses(tx, ctx.space.id), loadCards(tx, ctx.space.id, ctx.project?.id ?? null)]);
    return { statuses: statusList, cards };
  });
}

export async function getContentDetail(ctx: SpaceContext, contentId: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [row] = await tx
      .select({ item: contentItems, projectName: projects.name })
      .from(contentItems)
      .leftJoin(projects, eq(projects.id, contentItems.projectId))
      .where(and(eq(contentItems.id, contentId), eq(contentItems.spaceId, ctx.space.id)));
    if (!row) return null;

    const [statusList, pl, asg, taskList, commentList, activity, accounts, attached, library] = await Promise.all([
      loadContentStatuses(tx, ctx.space.id),
      tx.select().from(placements).where(eq(placements.contentItemId, contentId)),
      tx
        .select({ id: users.id, name: users.name })
        .from(contentAssignees)
        .innerJoin(users, eq(users.id, contentAssignees.userId))
        .where(eq(contentAssignees.contentItemId, contentId)),
      tx.select().from(tasks).where(eq(tasks.contentItemId, contentId)).orderBy(asc(tasks.createdAt)),
      tx
        .select({ comment: comments, authorName: users.name })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.authorUserId))
        .where(eq(comments.contentItemId, contentId))
        .orderBy(asc(comments.createdAt)),
      tx
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.targetType, "content_item"), eq(activityLog.targetId, contentId)))
        .orderBy(desc(activityLog.at))
        .limit(50),
      tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id)),
      mediaForContent(tx, [contentId]),
      tx
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.spaceId, ctx.space.id), eq(mediaAssets.status, "ready")))
        .orderBy(desc(mediaAssets.createdAt))
        .limit(200),
    ]);
    const view = (a: typeof mediaAssets.$inferSelect) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      filename: a.filename,
      hasThumb: Boolean(a.thumbKey),
      width: a.width,
      height: a.height,
    });

    return {
      item: row.item,
      projectName: row.projectName,
      statuses: statusList,
      placements: pl,
      assignees: asg,
      tasks: taskList,
      comments: commentList.map(({ comment, authorName }) => ({
        ...comment,
        authorName: authorName ?? comment.authorReviewerName ?? "Unknown",
      })),
      activity,
      accounts,
      media: attached.map((m) => view(m.asset)),
      library: library.map(view),
    };
  });
}

export type ContentDetail = NonNullable<Awaited<ReturnType<typeof getContentDetail>>>;
