import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { mediaForContent } from "@/db/media";
import { contentAssignees, contentItems, memberships, placements, projects, spaceMembers, statuses, users } from "@/db/schema";
import { isoDate, zonedParts } from "@/lib/analytics/time";
import { formatSchedule } from "@/lib/format";
import type { PlacementKind } from "@/lib/placements";
import { cleanTags } from "@/lib/table";
import { logActivity } from "./activity";
import type { SpaceContext } from "./tenancy";

export interface TableRow {
  id: string;
  title: string;
  statusId: string;
  projectId: string | null;
  scheduledAt: string | null;
  /** "YYYY-MM-DDTHH:mm" in the space's timezone, for the date picker. */
  scheduledLocal: string | null;
  scheduleText: string | null;
  kinds: PlacementKind[];
  assigneeIds: string[];
  tags: string[];
  pillar: string | null;
  publishState: string;
  autopost: boolean;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  coverId: string | null;
}

/** People who can be assigned in this space: Owners and Admins, plus the space's members. */
export async function assignableMembers(tx: Tx, ctx: SpaceContext) {
  const inSpace = await tx.select({ id: spaceMembers.userId }).from(spaceMembers).where(eq(spaceMembers.spaceId, ctx.space.id));
  return tx
    .select({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(or(inArray(memberships.role, ["owner", "admin"]), inSpace.length ? inArray(memberships.userId, inSpace.map((m) => m.id)) : undefined))
    .orderBy(asc(users.name));
}

export async function loadTable(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [items, statusList, projectList, members] = await Promise.all([
      tx.select().from(contentItems).where(eq(contentItems.spaceId, ctx.space.id)).orderBy(asc(contentItems.position), asc(contentItems.createdAt)),
      tx.select().from(statuses).where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.appliesTo, "content"))).orderBy(asc(statuses.position)),
      tx.select().from(projects).where(and(eq(projects.spaceId, ctx.space.id), isNull(projects.archivedAt))).orderBy(asc(projects.name)),
      assignableMembers(tx, ctx),
    ]);
    const ids = items.map((i) => i.id);
    const [pl, asg, media] = await Promise.all([
      ids.length ? tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, ids)) : [],
      ids.length ? tx.select().from(contentAssignees).where(inArray(contentAssignees.contentItemId, ids)) : [],
      mediaForContent(tx, ids),
    ]);
    const tz = ctx.space.timezone;
    const rows: TableRow[] = items.map((i) => {
      const local = i.scheduledAt ? zonedParts(i.scheduledAt, tz) : null;
      return {
        id: i.id,
        title: i.title,
        statusId: i.statusId,
        projectId: i.projectId,
        scheduledAt: i.scheduledAt?.toISOString() ?? null,
        scheduledLocal: local ? `${isoDate(local)}T${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}` : null,
        scheduleText: formatSchedule(i.scheduledAt, tz),
        kinds: pl.filter((p) => p.contentItemId === i.id).map((p) => p.kind as PlacementKind),
        assigneeIds: asg.filter((a) => a.contentItemId === i.id).map((a) => a.userId),
        tags: i.tags,
        pillar: i.pillar,
        publishState: i.publishState,
        autopost: i.autopost,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
        archived: Boolean(i.archivedAt),
        coverId: media.find((m) => m.contentId === i.id && m.asset.status === "ready" && m.asset.thumbKey)?.asset.id ?? null,
      };
    });
    return {
      rows,
      statuses: statusList.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category })),
      projects: projectList.map((p) => ({ id: p.id, name: p.name })),
      members,
    };
  });
}

export type TableData = Awaited<ReturnType<typeof loadTable>>;

const actor = (ctx: SpaceContext) => ({ kind: "user" as const, userId: ctx.user.id, name: ctx.user.name });

async function itemIn(tx: Tx, ctx: SpaceContext, id: string) {
  const [item] = await tx.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.spaceId, ctx.space.id)));
  if (!item) throw new Error("That post isn’t in this space any more.");
  return item;
}

export async function setAssignees(ctx: SpaceContext, id: string, userIds: string[], mode: "replace" | "add" = "replace") {
  await withOrg(ctx.org.id, async (tx) => {
    const item = await itemIn(tx, ctx, id);
    const allowed = new Set((await assignableMembers(tx, ctx)).map((m) => m.id));
    const wanted = [...new Set(userIds)];
    if (wanted.some((u) => !allowed.has(u))) throw new Error("Only people in this space can be assigned.");
    const current = (await tx.select().from(contentAssignees).where(eq(contentAssignees.contentItemId, id))).map((a) => a.userId);
    const next = mode === "add" ? [...new Set([...current, ...wanted])] : wanted;
    if (next.length === current.length && next.every((u) => current.includes(u))) return;
    await tx.delete(contentAssignees).where(eq(contentAssignees.contentItemId, id));
    if (next.length) await tx.insert(contentAssignees).values(next.map((userId) => ({ orgId: ctx.org.id, contentItemId: id, userId })));
    const names = await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set([...current, ...next])]));
    const label = (list: string[]) => list.map((u) => names.find((n) => n.id === u)?.name ?? "someone").join(", ") || "nobody";
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: item.id, actor: actor(ctx), action: "updated", field: "assignees", before: label(current), after: label(next) });
  });
}

export async function setFields(ctx: SpaceContext, id: string, change: { projectId?: string | null; tags?: string[]; pillar?: string | null; addTag?: string }) {
  await withOrg(ctx.org.id, async (tx) => {
    const item = await itemIn(tx, ctx, id);
    const patch: Partial<typeof contentItems.$inferInsert> = {};
    if (change.projectId !== undefined) {
      if (change.projectId) {
        const [p] = await tx.select().from(projects).where(and(eq(projects.id, change.projectId), eq(projects.spaceId, ctx.space.id)));
        if (!p) throw new Error("That project isn’t in this space.");
      }
      if (change.projectId !== item.projectId) patch.projectId = change.projectId;
    }
    if (change.tags !== undefined) patch.tags = cleanTags(change.tags);
    if (change.addTag !== undefined) patch.tags = cleanTags([...item.tags, change.addTag]);
    if (change.pillar !== undefined) patch.pillar = change.pillar?.trim().slice(0, 60) || null;
    const fields = Object.keys(patch) as (keyof typeof patch)[];
    const changed = fields.filter((f) => JSON.stringify(patch[f]) !== JSON.stringify(item[f as keyof typeof item]));
    if (changed.length === 0) return;
    await tx.update(contentItems).set({ ...patch, updatedAt: new Date() }).where(eq(contentItems.id, id));
    for (const f of changed) {
      await logActivity(tx, {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        contentItemId: id,
        actor: actor(ctx),
        action: "updated",
        field: f === "projectId" ? "project" : f,
        before: item[f as keyof typeof item] ?? null,
        after: patch[f] ?? null,
      });
    }
  });
}

const BUSY = ["scheduled", "publishing"];

export async function archive(ctx: SpaceContext, id: string, archived: boolean) {
  await withOrg(ctx.org.id, async (tx) => {
    const item = await itemIn(tx, ctx, id);
    if (archived && BUSY.includes(item.publishState)) throw new Error("Unschedule it first.");
    if (Boolean(item.archivedAt) === archived) return;
    await tx.update(contentItems).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(contentItems.id, id));
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: id, actor: actor(ctx), action: archived ? "archived" : "restored from archive" });
  });
}

/** Deletes a post with its placements, comments, tasks and approvals. Published posts stay in analytics. */
export async function remove(ctx: SpaceContext, id: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const item = await itemIn(tx, ctx, id);
    if (BUSY.includes(item.publishState)) throw new Error("Unschedule it first.");
    await tx.delete(contentItems).where(eq(contentItems.id, item.id));
  });
}
