import "server-only";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, type SQL } from "drizzle-orm";
import { withOrg } from "@/db";
import { notificationSettings, notifications, spaces } from "@/db/schema";
import { cleanPrefs, effectivePrefs, kindsOf, TYPES, type NotificationType, type TypePrefs } from "@/lib/notifications";
import type { OrgContext } from "./tenancy";

export interface NotificationFilters {
  tab: "primary" | "cleared";
  q: string;
  type: NotificationType | "";
  space: string;
  unread: boolean;
}

export const PAGE_SIZE = 50;

export function readFilters(query: Record<string, string | string[] | undefined>): NotificationFilters & { limit: number } {
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : "");
  const type = one("type");
  return {
    tab: one("tab") === "cleared" ? "cleared" : "primary",
    q: one("q").trim().slice(0, 100),
    type: TYPES.some((t) => t.id === type) ? (type as NotificationType) : "",
    space: one("space"),
    unread: one("unread") === "1",
    limit: Math.min(500, Math.max(PAGE_SIZE, Number(one("limit")) || PAGE_SIZE)),
  };
}

const mine = (ctx: OrgContext) => and(eq(notifications.userId, ctx.user.id), eq(notifications.inApp, true));

/** NT-01: the person's notifications for one tab, newest first. */
export async function listNotifications(ctx: OrgContext, f: NotificationFilters & { limit: number }, visibleSpaceIds: string[]) {
  const where: (SQL | undefined)[] = [mine(ctx), f.tab === "cleared" ? isNotNull(notifications.clearedAt) : isNull(notifications.clearedAt)];
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(notifications.title, like), ilike(notifications.body, like)));
  }
  // System covers every kind without a type of its own.
  if (f.type === "system") where.push(notInArray(notifications.kind, TYPES.filter((t) => t.id !== "system").flatMap((t) => kindsOf(t.id))));
  else if (f.type) where.push(inArray(notifications.kind, kindsOf(f.type)));
  if (f.space) where.push(f.space === "none" ? isNull(notifications.spaceId) : eq(notifications.spaceId, f.space));
  if (f.unread) where.push(isNull(notifications.readAt));
  // A space the person was removed from no longer shows its notifications.
  where.push(visibleSpaceIds.length ? or(isNull(notifications.spaceId), inArray(notifications.spaceId, visibleSpaceIds)) : isNull(notifications.spaceId));

  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx
      .select({ n: notifications, spaceName: spaces.name, spaceColor: spaces.avatarColor })
      .from(notifications)
      .leftJoin(spaces, eq(spaces.id, notifications.spaceId))
      .where(and(...where))
      .orderBy(desc(notifications.createdAt))
      .limit(f.limit + 1);
    const [[{ primary }], [{ unread }], [{ cleared }]] = await Promise.all([
      tx.select({ primary: count() }).from(notifications).where(and(mine(ctx), isNull(notifications.clearedAt))),
      tx.select({ unread: count() }).from(notifications).where(and(mine(ctx), isNull(notifications.clearedAt), isNull(notifications.readAt))),
      tx.select({ cleared: count() }).from(notifications).where(and(mine(ctx), isNotNull(notifications.clearedAt))),
    ]);
    return { rows: rows.slice(0, f.limit), more: rows.length > f.limit, counts: { primary, unread, cleared } };
  });
}

/** For the bell and the sidebar: the latest few and the unread count (Primary tab only). */
export async function bellData(ctx: OrgContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [recent, [{ unread }]] = await Promise.all([
      tx
        .select()
        .from(notifications)
        .where(and(mine(ctx), isNull(notifications.clearedAt)))
        .orderBy(desc(notifications.createdAt))
        .limit(12),
      tx.select({ unread: count() }).from(notifications).where(and(mine(ctx), isNull(notifications.clearedAt), isNull(notifications.readAt))),
    ]);
    return { recent, unread };
  });
}

/* ---------- Changes ---------- */

const ownRows = (ctx: OrgContext, ids?: string[]) => and(mine(ctx), ids ? inArray(notifications.id, ids) : undefined);

export async function setRead(ctx: OrgContext, ids: string[] | "all", read: boolean) {
  await withOrg(ctx.org.id, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: read ? new Date() : null })
      .where(and(ownRows(ctx, ids === "all" ? undefined : ids), read ? isNull(notifications.readAt) : isNotNull(notifications.readAt), ids === "all" ? isNull(notifications.clearedAt) : undefined)),
  );
}

/** Clear moves to the Cleared tab and marks as read; restore brings it back. */
export async function setCleared(ctx: OrgContext, ids: string[] | "all", cleared: boolean) {
  const now = new Date();
  await withOrg(ctx.org.id, (tx) =>
    tx
      .update(notifications)
      .set(cleared ? { clearedAt: now, readAt: now } : { clearedAt: null })
      .where(and(ownRows(ctx, ids === "all" ? undefined : ids), cleared ? isNull(notifications.clearedAt) : isNotNull(notifications.clearedAt))),
  );
}

/* ---------- Preferences (NT-03, NT-04) ---------- */

export async function loadSettings(ctx: OrgContext) {
  const rows = await withOrg(ctx.org.id, (tx) => tx.select().from(notificationSettings).where(eq(notificationSettings.userId, ctx.user.id)));
  const base = rows.find((r) => r.scope === "default");
  return {
    base: base ? cleanPrefs(base.settings.types) : null,
    digest: base?.settings.digest ?? false,
    timeZone: base?.settings.timeZone ?? null,
    spaces: Object.fromEntries(rows.filter((r) => r.scope !== "default").map((r) => [r.scope, cleanPrefs(r.settings.types)])) as Record<string, TypePrefs>,
  };
}

async function upsert(ctx: OrgContext, scope: string, change: (current: { types?: TypePrefs; digest?: boolean; timeZone?: string }) => { types?: TypePrefs; digest?: boolean; timeZone?: string }) {
  await withOrg(ctx.org.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(notificationSettings)
      .where(and(eq(notificationSettings.userId, ctx.user.id), eq(notificationSettings.scope, scope)));
    const settings = change(row?.settings ?? {});
    if (row) await tx.update(notificationSettings).set({ settings, updatedAt: new Date() }).where(eq(notificationSettings.id, row.id));
    else await tx.insert(notificationSettings).values({ orgId: ctx.org.id, userId: ctx.user.id, scope, settings });
  });
}

/** Saves the whole table for a scope ("default" or a space id). */
export async function saveTypes(ctx: OrgContext, scope: string, types: TypePrefs) {
  await upsert(ctx, scope, (s) => ({ ...s, types: cleanPrefs(types) }));
}

/** "Use default": the space follows the person's defaults again. */
export async function resetToDefault(ctx: OrgContext, spaceId: string) {
  await withOrg(ctx.org.id, (tx) =>
    tx.delete(notificationSettings).where(and(eq(notificationSettings.userId, ctx.user.id), eq(notificationSettings.scope, spaceId))),
  );
}

/** "Apply to other spaces": copies one space's table to the others the person can see. */
export async function applyToSpaces(ctx: OrgContext, fromSpaceId: string, spaceIds: string[]) {
  const s = await loadSettings(ctx);
  const types = effectivePrefs({ space: s.spaces[fromSpaceId], base: s.base });
  for (const id of spaceIds) if (id !== fromSpaceId) await saveTypes(ctx, id, types);
}

export async function saveDigest(ctx: OrgContext, digest: boolean, timeZone: string) {
  await upsert(ctx, "default", (s) => ({ ...s, digest, timeZone }));
}
