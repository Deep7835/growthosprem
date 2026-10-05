import "server-only";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getSystemDb, withOrg } from "@/db";
import { memberships, organizations, projects, spaceMembers, spaces } from "@/db/schema";
import { can, canSeeSpace, type Action } from "@/lib/permissions";
import { getSessionUser } from "./session";

type Resolved<T> = { ok: true; value: T } | { ok: false; reason: "signed-out" | "not-found" };

const resolveOrg = cache(async (orgSlug: string) => {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "signed-out" } as const;
  const db = await getSystemDb();
  const [row] = await db
    .select({ org: organizations, role: memberships.role, lastActiveAt: memberships.lastActiveAt })
    .from(organizations)
    .innerJoin(memberships, and(eq(memberships.orgId, organizations.id), eq(memberships.userId, user.id)))
    .where(eq(organizations.slug, orgSlug));
  // Not a member looks the same as not existing.
  if (!row) return { ok: false, reason: "not-found" } as const;
  const requestTime = Date.now();
  const trialDaysLeft = row.org.trialEndsAt ? Math.max(0, Math.ceil((row.org.trialEndsAt.getTime() - requestTime) / 864e5)) : null;
  // "Last active" for Settings › Members, written at most every 5 minutes.
  if (!row.lastActiveAt || requestTime - row.lastActiveAt.getTime() > 5 * 60 * 1000) {
    await withOrg(row.org.id, (tx) =>
      tx.update(memberships).set({ lastActiveAt: new Date(requestTime) }).where(and(eq(memberships.orgId, row.org.id), eq(memberships.userId, user.id))),
    );
  }
  return { ok: true, value: { user, org: row.org, role: row.role, trialDaysLeft, requestTime } } as const;
});

function unwrap<T>(r: Resolved<T>): T {
  if (r.ok) return r.value;
  if (r.reason === "signed-out") redirect("/sign-in");
  notFound();
}

/** For Route Handlers: the organisation context, or the HTTP status to answer with. */
export async function orgContextForRoute(orgSlug: string) {
  const r = await resolveOrg(orgSlug);
  if (!r.ok) return { ctx: null, status: r.reason === "signed-out" ? 401 : 404 } as const;
  return { ctx: r.value, status: 200 } as const;
}

/** Resolves the organisation in the URL and the signed-in user's role in it. */
export const getOrgContext = cache(async (orgSlug: string) => unwrap(await resolveOrg(orgSlug)));

export type OrgContext = Awaited<ReturnType<typeof getOrgContext>>;

/** Archived spaces the user can see (SP-05, "Show archived spaces"). */
export const listArchivedSpaces = cache(async (orgSlug: string) => {
  const ctx = await getOrgContext(orgSlug);
  return withOrg(ctx.org.id, async (tx) => {
    const archived = await tx.select().from(spaces).where(and(isNotNull(spaces.archivedAt), isNull(spaces.deletedAt))).orderBy(asc(spaces.name));
    if (ctx.role === "owner" || ctx.role === "admin") return archived;
    const mine = new Set((await tx.select({ spaceId: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, ctx.user.id))).map((m) => m.spaceId));
    return archived.filter((sp) => mine.has(sp.id));
  });
});

/** Spaces the user can see: all for Owner and Admin, otherwise the ones they were added to. */
export const listVisibleSpaces = cache(async (orgSlug: string) => {
  const ctx = await getOrgContext(orgSlug);
  return withOrg(ctx.org.id, async (tx) => {
    const all = await tx.select().from(spaces).where(and(isNull(spaces.archivedAt), isNull(spaces.deletedAt))).orderBy(asc(spaces.createdAt));
    if (ctx.role === "owner" || ctx.role === "admin") return all;
    const mine = await tx
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(eq(spaceMembers.userId, ctx.user.id));
    const ids = new Set(mine.map((m) => m.spaceId));
    return all.filter((sp) => ids.has(sp.id));
  });
});

const READ_ONLY = new Set<Action>(["content.view", "analytics.view"]);

const resolveSpace = cache(async (orgSlug: string, spaceSlug: string) => {
  const org = await resolveOrg(orgSlug);
  if (!org.ok) return org;
  const ctx = org.value;
  const result = await withOrg(ctx.org.id, async (tx) => {
    const [space] = await tx.select().from(spaces).where(and(eq(spaces.slug, spaceSlug), isNull(spaces.deletedAt)));
    if (!space) return null;
    const [membership] = await tx
      .select()
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, ctx.user.id)));
    return { space, isSpaceMember: Boolean(membership) };
  });
  if (!result || !canSeeSpace(ctx.role, result.isSpaceMember)) return { ok: false, reason: "not-found" } as const;
  const scope = { isSpaceMember: result.isSpaceMember, editorsCanSchedule: result.space.editorsCanSchedule };
  return {
    ok: true,
    value: {
      ...ctx,
      space: result.space,
      // Set on project pages (PJ-02): views then show only that project's work.
      project: null as Project | null,
      scope,
      // SP-05: archived spaces can be looked at, not changed.
      can: (action: Action) => (result.space.archivedAt && !READ_ONLY.has(action) ? false : can(ctx.role, action, scope)),
    },
  } as const;
});

export const getSpaceContext = cache(async (orgSlug: string, spaceSlug: string) => unwrap(await resolveSpace(orgSlug, spaceSlug)));

/** For Route Handlers: the space context, or the HTTP status to answer with. Never redirects. */
export async function spaceContextForRoute(orgSlug: string, spaceSlug: string, action: Action) {
  const r = await resolveSpace(orgSlug, spaceSlug);
  if (!r.ok) return { ctx: null, status: r.reason === "signed-out" ? 401 : 404 } as const;
  if (!r.value.can(action)) return { ctx: null, status: 403 } as const;
  return { ctx: r.value, status: 200 } as const;
}

export type SpaceContext = Awaited<ReturnType<typeof getSpaceContext>>;
type Project = typeof projects.$inferSelect;

/** A project page's context: the space's, with the project set. Archived projects still open (read as history). */
export const getProjectContext = cache(async (orgSlug: string, spaceSlug: string, projectId: string): Promise<SpaceContext> => {
  const ctx = await getSpaceContext(orgSlug, spaceSlug);
  if (!/^[0-9a-f-]{36}$/.test(projectId)) notFound();
  const [project] = await withOrg(ctx.org.id, (tx) => tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.spaceId, ctx.space.id))));
  if (!project) notFound();
  return { ...ctx, project };
});

/** For server actions: the space context, or an error if the user may not do `action`. */
export async function requireSpaceAction(orgSlug: string, spaceSlug: string, action: Action) {
  const ctx = await getSpaceContext(orgSlug, spaceSlug);
  // SP-05: an archived space is read-only until it's restored (from Settings › Spaces).
  if (ctx.space.archivedAt && !READ_ONLY.has(action)) throw new Error(`${ctx.space.name} is archived, so it’s read-only. Restore it to make changes.`);
  if (!ctx.can(action)) throw new Error(`Your role (${ctx.role}) cannot ${action} in ${ctx.space.name}.`);
  return ctx;
}
