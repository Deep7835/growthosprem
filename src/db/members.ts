// Member management (TM-03). Free of Next.js imports so it can be tested.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { InviteRole } from "@/lib/permissions";
import { withOrg, type Db } from "./core";
import * as s from "./schema";

/** Members with their spaces and open work, for Settings › Members. */
export async function listMembers(db: Db, orgId: string) {
  return withOrg(db, orgId, async (tx) => {
    const rows = await tx
      .select({ membership: s.memberships, name: s.users.name, email: s.users.email })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .orderBy(s.memberships.createdAt);
    const [links, assigned, openTasks] = await Promise.all([
      tx.select({ userId: s.spaceMembers.userId, spaceId: s.spaceMembers.spaceId }).from(s.spaceMembers),
      tx
        .select({ userId: s.contentAssignees.userId, category: s.statuses.category })
        .from(s.contentAssignees)
        .innerJoin(s.contentItems, eq(s.contentItems.id, s.contentAssignees.contentItemId))
        .innerJoin(s.statuses, eq(s.statuses.id, s.contentItems.statusId)),
      tx.select({ userId: s.tasks.assigneeId }).from(s.tasks).where(eq(s.tasks.done, false)),
    ]);
    return rows.map((r) => ({
      userId: r.membership.userId,
      name: r.name,
      email: r.email,
      role: r.membership.role,
      lastActiveAt: r.membership.lastActiveAt,
      joinedAt: r.membership.createdAt,
      spaceIds: links.filter((l) => l.userId === r.membership.userId).map((l) => l.spaceId),
      openPosts: assigned.filter((a) => a.userId === r.membership.userId && (a.category === "not_started" || a.category === "active")).length,
      openTasks: openTasks.filter((t) => t.userId === r.membership.userId).length,
    }));
  });
}

/** Changes a member's role and spaces. The Owner's access can't be changed here. */
export async function updateMemberAccess(db: Db, orgId: string, input: { userId: string; role: InviteRole; spaceIds: string[] }) {
  await withOrg(db, orgId, async (tx) => {
    const [member] = await tx
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.orgId, orgId), eq(s.memberships.userId, input.userId)));
    if (!member) throw new Error("That person is not a member.");
    if (member.role === "owner") throw new Error("The Owner’s access can’t be changed.");
    if (input.role !== "admin" && input.spaceIds.length === 0) throw new Error("Managers and Editors need at least one space.");

    await tx.update(s.memberships).set({ role: input.role }).where(eq(s.memberships.id, member.id));
    const spaceIds = input.role === "admin" ? [] : input.spaceIds;
    const valid = spaceIds.length ? (await tx.select({ id: s.spaces.id }).from(s.spaces).where(inArray(s.spaces.id, spaceIds))).map((x) => x.id) : [];
    await tx
      .delete(s.spaceMembers)
      .where(and(eq(s.spaceMembers.userId, input.userId), valid.length ? notInArray(s.spaceMembers.spaceId, valid) : undefined));
    if (valid.length) {
      await tx
        .insert(s.spaceMembers)
        .values(valid.map((spaceId) => ({ orgId, spaceId, userId: input.userId })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Removes a member: their membership and spaces go, and their open posts and tasks are
 * unassigned so nothing is left with someone who can no longer see it (TM-03).
 */
export async function removeMember(db: Db, orgId: string, userId: string) {
  return withOrg(db, orgId, async (tx) => {
    const [member] = await tx
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.orgId, orgId), eq(s.memberships.userId, userId)));
    if (!member) throw new Error("That person is not a member.");
    if (member.role === "owner") throw new Error("The Owner can’t be removed. Transfer ownership first.");

    const unassignedPosts = await tx.delete(s.contentAssignees).where(eq(s.contentAssignees.userId, userId)).returning();
    const unassignedTasks = await tx.update(s.tasks).set({ assigneeId: null }).where(eq(s.tasks.assigneeId, userId)).returning();
    await tx.delete(s.spaceMembers).where(eq(s.spaceMembers.userId, userId));
    await tx.delete(s.memberships).where(eq(s.memberships.id, member.id));
    return { posts: unassignedPosts.length, tasks: unassignedTasks.length };
  });
}
