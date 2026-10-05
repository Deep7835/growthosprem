// Sends one event to people, following each person's preferences (NT-03): an in-app row, an
// email (queued; the worker sends it), both or neither. Shared by server actions and the
// job worker, so no Next.js imports.
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/core";
import { memberships, notificationSettings, notifications, spaceMembers } from "@/db/schema";
import { channelsFor, cleanPrefs, typeOf, type Channels, type NotificationType, type TypePrefs } from "@/lib/notifications";

export interface NotificationEvent {
  orgId: string;
  spaceId: string | null;
  kind: string;
  title: string;
  body?: string;
  href?: string | null;
  /** Notify each person at most once per key. */
  key?: string;
  /** Skip the immediate email, e.g. publish failures, which email after 30 minutes instead (PB-10). */
  noEmail?: boolean;
}

/** Each person's channels for a type in a space. */
export async function channelsForPeople(tx: Tx, userIds: string[], spaceId: string | null, type: NotificationType): Promise<Map<string, Channels>> {
  const rows = userIds.length
    ? await tx
        .select()
        .from(notificationSettings)
        .where(and(inArray(notificationSettings.userId, userIds), inArray(notificationSettings.scope, spaceId ? ["default", spaceId] : ["default"])))
    : [];
  const prefs = (userId: string, scope: string): TypePrefs | null => {
    const row = rows.find((r) => r.userId === userId && r.scope === scope);
    return row ? cleanPrefs(row.settings.types) : null;
  };
  return new Map(userIds.map((u) => [u, channelsFor(type, { base: prefs(u, "default"), space: spaceId ? prefs(u, spaceId) : null })]));
}

/** Returns how many people were notified. */
export async function deliver(tx: Tx, userIds: string[], e: NotificationEvent): Promise<number> {
  const people = [...new Set(userIds)];
  if (people.length === 0) return 0;
  const channels = await channelsForPeople(tx, people, e.spaceId, typeOf(e.kind));
  const rows = people.flatMap((userId) => {
    const c = channels.get(userId)!;
    const email = c.email && !e.noEmail;
    if (!c.inApp && !email && !c.push) return [];
    return [
      {
        orgId: e.orgId,
        spaceId: e.spaceId,
        userId,
        kind: e.kind,
        title: e.title.slice(0, 300),
        body: (e.body ?? "").slice(0, 2000),
        href: e.href ?? null,
        inApp: c.inApp,
        emailStatus: email ? "pending" : null,
        pushStatus: c.push ? "pending" : null,
        key: e.key ?? null,
      },
    ];
  });
  if (rows.length === 0) return 0;
  const added = await tx.insert(notifications).values(rows).onConflictDoNothing().returning({ id: notifications.id });
  return added.length;
}

/** The space's Managers, plus Owners and Admins unless `admins` is false: the people who look after accounts and budgets. */
export async function spaceManagers(tx: Tx, spaceId: string | null, opts: { admins?: boolean } = {}): Promise<string[]> {
  const admins = opts.admins === false ? [] : await tx.select({ id: memberships.userId }).from(memberships).where(inArray(memberships.role, ["owner", "admin"]));
  const managers = spaceId
    ? await tx
        .select({ id: spaceMembers.userId })
        .from(spaceMembers)
        .innerJoin(memberships, and(eq(memberships.userId, spaceMembers.userId), eq(memberships.orgId, spaceMembers.orgId)))
        .where(and(eq(spaceMembers.spaceId, spaceId), eq(memberships.role, "manager")))
    : [];
  return [...new Set([...admins, ...managers].map((r) => r.id))];
}
