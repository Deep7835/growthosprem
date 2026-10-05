// Who hears about a post's publishing (PB-03, PB-10): its assignees and the space's Managers,
// or whoever created it. In-app notifications plus a follow-up email for failures.
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/core";
import { contentAssignees, memberships, spaceMembers, users } from "@/db/schema";
import { deliver } from "@/notifications/deliver";
import type { Bundle } from "./bundle";

export async function audience(tx: Tx, b: Bundle, opts: { managers: boolean }): Promise<string[]> {
  const ids = new Set<string>();
  const assigned = await tx.select({ id: contentAssignees.userId }).from(contentAssignees).where(eq(contentAssignees.contentItemId, b.item.id));
  for (const a of assigned) ids.add(a.id);
  if (opts.managers) {
    const managers = await tx
      .select({ id: spaceMembers.userId })
      .from(spaceMembers)
      .innerJoin(memberships, and(eq(memberships.userId, spaceMembers.userId), eq(memberships.orgId, spaceMembers.orgId)))
      .where(and(eq(spaceMembers.spaceId, b.space.id), eq(memberships.role, "manager")));
    for (const m of managers) ids.add(m.id);
  }
  if (ids.size === 0 && b.item.createdBy) ids.add(b.item.createdBy);
  if (ids.size === 0) {
    const owners = await tx.select({ id: memberships.userId }).from(memberships).where(inArray(memberships.role, ["owner", "admin"]));
    for (const o of owners) ids.add(o.id);
  }
  return [...ids];
}

export async function notify(tx: Tx, b: Bundle, userIds: string[], n: { kind: string; title: string; body?: string; noEmail?: boolean }) {
  await deliver(tx, userIds, { orgId: b.item.orgId, spaceId: b.space.id, kind: n.kind, title: n.title, body: n.body, href: b.itemHref, noEmail: n.noEmail });
}

export async function emailsFor(tx: Tx, userIds: string[]) {
  if (userIds.length === 0) return [];
  return tx.select({ email: users.email, name: users.name }).from(users).where(inArray(users.id, userIds));
}
