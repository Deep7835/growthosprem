import "server-only";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { slugify } from "@/db/accounts";
import { activityLog, contentAssignees, contentItems, memberships, placements, spaceMembers, spaces, statuses, tasks, users } from "@/db/schema";
import type { Platform } from "@/lib/placements";
import { STATUS_TEMPLATES, TASK_STATUSES, type StatusTemplateKey } from "@/lib/status-templates";
import { syncItemState } from "@/publishing/run";
import type { OrgContext, SpaceContext } from "./tenancy";
import { SPACE_COLORS } from "@/app/onboarding/options";

// Social spaces (PRD 6.3, SP-01 to SP-06).

export const DELETE_AFTER_DAYS = 30;
const PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin"];

const isAdmin = (ctx: OrgContext) => ctx.role === "owner" || ctx.role === "admin";
function requireAdmin(ctx: OrgContext, what: string) {
  if (!isAdmin(ctx)) throw new Error(`Only the Owner and Admins can ${what}.`);
}

async function spaceById(tx: Tx, id: string) {
  const [sp] = await tx.select().from(spaces).where(eq(spaces.id, id));
  if (!sp) throw new Error("That space doesn’t exist any more.");
  return sp;
}

/** Settings › Spaces: every space with its size, archived ones, and (for the Owner) recently deleted. */
export async function listSpacesForAdmin(ctx: OrgContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx.select().from(spaces).orderBy(asc(spaces.name));
    const ids = rows.map((r) => r.id);
    const [members, posts, scheduled] = ids.length
      ? await Promise.all([
          tx.select({ id: spaceMembers.spaceId, n: count() }).from(spaceMembers).where(inArray(spaceMembers.spaceId, ids)).groupBy(spaceMembers.spaceId),
          tx.select({ id: contentItems.spaceId, n: count() }).from(contentItems).where(inArray(contentItems.spaceId, ids)).groupBy(contentItems.spaceId),
          tx
            .select({ id: contentItems.spaceId, n: count() })
            .from(contentItems)
            .where(and(inArray(contentItems.spaceId, ids), eq(contentItems.publishState, "scheduled")))
            .groupBy(contentItems.spaceId),
        ])
      : [[], [], []];
    const num = (list: { id: string; n: number }[], id: string) => list.find((x) => x.id === id)?.n ?? 0;
    const now = ctx.requestTime;
    return rows
      .filter((r) => !r.deletedAt || ctx.role === "owner")
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        color: r.avatarColor,
        archived: Boolean(r.archivedAt),
        deletedAt: r.deletedAt?.toISOString() ?? null,
        daysLeft: r.deletedAt ? Math.max(0, Math.min(DELETE_AFTER_DAYS, Math.ceil((r.deletedAt.getTime() + DELETE_AFTER_DAYS * 864e5 - now) / 864e5))) : null,
        members: num(members, r.id),
        posts: num(posts, r.id),
        scheduled: num(scheduled, r.id),
      }));
  });
}

export type AdminSpace = Awaited<ReturnType<typeof listSpacesForAdmin>>[number];

/** People who can be added to a space: Managers and Editors (Owners and Admins are in every space). */
export async function addableMembers(ctx: OrgContext) {
  return withOrg(ctx.org.id, (tx) =>
    tx
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.role, ["manager", "editor"]))
      .orderBy(asc(users.name)),
  );
}

export interface NewSpace {
  name: string;
  color: string;
  timezone: string;
  memberIds: string[];
  statuses: { template: StatusTemplateKey } | { copyFrom: string };
}

/** SP-01: a space with its statuses (a template or copied from another space) and members. */
export async function createSpace(ctx: OrgContext, input: NewSpace) {
  requireAdmin(ctx, "create spaces");
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) throw new Error("Give the space a name.");
  return withOrg(ctx.org.id, async (tx) => {
    const taken = new Set((await tx.select({ slug: spaces.slug }).from(spaces)).map((r) => r.slug));
    const base = slugify(name) === "workspace" ? "space" : slugify(name);
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

    let contentSet: { name: string; color: string; category: (typeof statuses.$inferInsert)["category"]; reviewRole: (typeof statuses.$inferInsert)["reviewRole"]; autopost: boolean }[];
    let taskSet = TASK_STATUSES.map(([n, color, category]) => ({ name: n, color, category }));
    if ("copyFrom" in input.statuses) {
      const source = await spaceById(tx, input.statuses.copyFrom);
      if (source.deletedAt) throw new Error("That space was deleted.");
      const rows = await tx.select().from(statuses).where(eq(statuses.spaceId, source.id)).orderBy(asc(statuses.position));
      contentSet = rows.filter((r) => r.appliesTo === "content").map((r) => ({ name: r.name, color: r.color, category: r.category, reviewRole: r.reviewRole, autopost: r.autopostEligible }));
      const copiedTasks = rows.filter((r) => r.appliesTo === "task");
      if (copiedTasks.length) taskSet = copiedTasks.map((r) => ({ name: r.name, color: r.color, category: r.category }));
    } else {
      const template = STATUS_TEMPLATES[input.statuses.template];
      if (!template) throw new Error("Pick a status template.");
      contentSet = template.statuses.map(([n, color, category, reviewRole, autopost]) => ({ name: n, color, category, reviewRole, autopost: Boolean(autopost) }));
    }

    const [space] = await tx
      .insert(spaces)
      .values({
        orgId: ctx.org.id,
        slug,
        name,
        avatarColor: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : SPACE_COLORS[0],
        timezone: input.timezone,
        requireClientApproval: ctx.org.accountType === "agency",
      })
      .returning();
    await tx.insert(statuses).values([
      ...contentSet.map((st, position) => ({ orgId: ctx.org.id, spaceId: space.id, name: st.name, color: st.color, category: st.category, reviewRole: st.reviewRole, autopostEligible: st.autopost, position })),
      ...taskSet.map((st, i) => ({ orgId: ctx.org.id, spaceId: space.id, name: st.name, color: st.color, category: st.category, appliesTo: "task" as const, position: 100 + i })),
    ]);
    const allowed = new Set((await tx.select({ id: memberships.userId }).from(memberships).where(inArray(memberships.role, ["manager", "editor"]))).map((m) => m.id));
    const memberIds = [...new Set(input.memberIds)].filter((id) => allowed.has(id));
    if (memberIds.length) await tx.insert(spaceMembers).values(memberIds.map((userId) => ({ orgId: ctx.org.id, spaceId: space.id, userId })));
    return space;
  });
}

/** SP-03: the Space tab. */
export async function updateSpace(
  ctx: SpaceContext,
  patch: { name?: string; color?: string; timezone?: string; platformColors?: Partial<Record<Platform, string>>; hiddenPlatforms?: Platform[] },
) {
  const set: Partial<typeof spaces.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 60);
    if (name.length < 2) throw new Error("Give the space a name.");
    set.name = name;
  }
  if (patch.color !== undefined) set.avatarColor = /^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : ctx.space.avatarColor;
  if (patch.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: patch.timezone });
    } catch {
      throw new Error("That time zone isn’t recognised.");
    }
    set.timezone = patch.timezone;
  }
  if (patch.platformColors !== undefined) {
    set.platformColors = Object.fromEntries(Object.entries(patch.platformColors).filter(([p, c]) => PLATFORMS.includes(p as Platform) && /^#[0-9a-f]{6}$/i.test(c ?? "")));
  }
  if (patch.hiddenPlatforms !== undefined) {
    const hidden = PLATFORMS.filter((p) => patch.hiddenPlatforms!.includes(p));
    if (hidden.length === PLATFORMS.length) throw new Error("Keep at least one platform.");
    set.hiddenPlatforms = hidden;
  }
  if (Object.keys(set).length === 0) return;
  await withOrg(ctx.org.id, (tx) => tx.update(spaces).set(set).where(eq(spaces.id, ctx.space.id)));
}

/** Archiving or deleting a space pauses its scheduled posts, so nothing goes out from it. */
async function pauseScheduled(tx: Tx, ctx: OrgContext, spaceId: string, why: string) {
  const items = await tx
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.spaceId, spaceId), inArray(contentItems.publishState, ["scheduled", "partially_published"])));
  for (const { id } of items) {
    await tx.update(placements).set({ state: "draft" }).where(and(eq(placements.contentItemId, id), eq(placements.state, "scheduled")));
    await syncItemState(tx, id);
    await tx.insert(activityLog).values({
      orgId: ctx.org.id,
      spaceId,
      targetType: "content_item",
      targetId: id,
      actorKind: "user",
      actorUserId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: `unscheduled because the space was ${why}`,
    });
  }
  return items.length;
}

/** SP-05: archive (hidden, read-only) or restore. Returns how many scheduled posts were paused. */
export async function setSpaceArchived(ctx: OrgContext, spaceId: string, archived: boolean) {
  requireAdmin(ctx, "archive spaces");
  return withOrg(ctx.org.id, async (tx) => {
    const sp = await spaceById(tx, spaceId);
    if (sp.deletedAt) throw new Error("That space was deleted. Restore it first.");
    await tx.update(spaces).set({ archivedAt: archived ? new Date() : null }).where(eq(spaces.id, sp.id));
    return archived ? pauseScheduled(tx, ctx, sp.id, "archived") : 0;
  });
}

/** SP-06: after typing the name exactly, the space is hidden at once and removed for good after 30 days. */
export async function deleteSpace(ctx: OrgContext, spaceId: string, typedName: string) {
  requireAdmin(ctx, "delete spaces");
  return withOrg(ctx.org.id, async (tx) => {
    const sp = await spaceById(tx, spaceId);
    if (typedName.trim() !== sp.name) throw new Error("Type the space’s name exactly to delete it.");
    const live = await tx.select({ id: spaces.id }).from(spaces).where(and(isNull(spaces.deletedAt), isNull(spaces.archivedAt)));
    if (live.length === 1 && live[0].id === sp.id) throw new Error("This is the only active space. Create another one first.");
    await tx.update(spaces).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(eq(spaces.id, sp.id));
    return pauseScheduled(tx, ctx, sp.id, "deleted");
  });
}

/** SP-06: only the Owner can bring a deleted space back, within 30 days. */
export async function restoreDeletedSpace(ctx: OrgContext, spaceId: string) {
  if (ctx.role !== "owner") throw new Error("Only the Owner can restore a deleted space.");
  await withOrg(ctx.org.id, async (tx) => {
    const sp = await spaceById(tx, spaceId);
    if (!sp.deletedAt) return;
    await tx.update(spaces).set({ deletedAt: null, deletedBy: null }).where(eq(spaces.id, sp.id));
  });
}

/* ---------- Members tab (SP-02) ---------- */

/** Everyone who can work in the space: Owners and Admins always, then the people added to it. */
export async function spaceMemberList(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [org, added] = await Promise.all([
      tx
        .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .orderBy(asc(users.name)),
      tx.select({ userId: spaceMembers.userId }).from(spaceMembers).where(eq(spaceMembers.spaceId, ctx.space.id)),
    ]);
    const inSpace = new Set(added.map((a) => a.userId));
    return {
      members: org.filter((m) => m.role === "owner" || m.role === "admin" || inSpace.has(m.id)).map((m) => ({ ...m, automatic: m.role === "owner" || m.role === "admin" })),
      addable: org.filter((m) => (m.role === "manager" || m.role === "editor") && !inSpace.has(m.id)),
    };
  });
}

export async function addToSpace(ctx: SpaceContext, userIds: string[]) {
  await withOrg(ctx.org.id, async (tx) => {
    const ok = new Set((await tx.select({ id: memberships.userId }).from(memberships).where(and(inArray(memberships.userId, userIds.length ? userIds : [ctx.user.id]), inArray(memberships.role, ["manager", "editor"])))).map((m) => m.id));
    const rows = userIds.filter((u) => ok.has(u)).map((userId) => ({ orgId: ctx.org.id, spaceId: ctx.space.id, userId }));
    if (rows.length !== userIds.length) throw new Error("Only Managers and Editors in this organisation can be added.");
    if (rows.length) await tx.insert(spaceMembers).values(rows).onConflictDoNothing();
  });
}

/**
 * Takes someone out of the space. Their open tasks and post assignments here are unassigned,
 * so nothing waits on a person who can no longer see it.
 */
export async function removeFromSpace(ctx: SpaceContext, userId: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.userId, userId));
    if (!m) throw new Error("That person isn’t in this organisation.");
    if (m.role === "owner" || m.role === "admin") throw new Error("Owners and Admins are in every space.");
    await tx.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, ctx.space.id), eq(spaceMembers.userId, userId)));
    const openTasks = await tx
      .update(tasks)
      .set({ assigneeId: null, updatedAt: new Date() })
      .where(and(eq(tasks.spaceId, ctx.space.id), eq(tasks.assigneeId, userId), eq(tasks.done, false)))
      .returning({ id: tasks.id });
    const posts = tx.select({ id: contentItems.id }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id));
    const unassigned = await tx
      .delete(contentAssignees)
      .where(and(eq(contentAssignees.userId, userId), inArray(contentAssignees.contentItemId, posts)))
      .returning({ id: contentAssignees.contentItemId });
    return { tasks: openTasks.length, posts: unassigned.length };
  });
}

/** What the create dialog offers: people, templates and spaces to copy statuses from. */
export async function createSpaceOptions(ctx: OrgContext) {
  const [people, counts] = await Promise.all([
    addableMembers(ctx),
    withOrg(ctx.org.id, (tx) =>
      tx
        .select({ id: spaces.id, name: spaces.name, n: count(statuses.id) })
        .from(spaces)
        .leftJoin(statuses, and(eq(statuses.spaceId, spaces.id), eq(statuses.appliesTo, "content")))
        .where(isNull(spaces.deletedAt))
        .groupBy(spaces.id, spaces.name)
        .orderBy(asc(spaces.name)),
    ),
  ]);
  return {
    people,
    templates: (Object.keys(STATUS_TEMPLATES) as StatusTemplateKey[]).map((key) => ({ key, label: STATUS_TEMPLATES[key].label, description: STATUS_TEMPLATES[key].description, count: STATUS_TEMPLATES[key].statuses.length })),
    spaces: counts.map((c) => ({ id: c.id, name: c.name, count: c.n })),
  };
}
