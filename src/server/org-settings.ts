// Organisation settings: name, branding and the tag list (Settings › General, Branding, Tags).
import { and, asc, eq, sql } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { contentItems, organizations, orgTags, users } from "@/db/schema";
import { can } from "@/lib/permissions";
import { assertNotLocked, getOrgContext } from "@/server/tenancy";

type OrgContext = Awaited<ReturnType<typeof getOrgContext>>;

/** Owners and Admins change organisation-wide settings. */
export function requireOrgSettings(ctx: OrgContext) {
  if (!can(ctx.role, "org.settings")) throw new Error("Only Owners and Admins can change organisation settings.");
  assertNotLocked(ctx);
}

export async function setDisplayName(ctx: OrgContext, name: string) {
  const db = await getSystemDb();
  await db.update(users).set({ name }).where(eq(users.id, ctx.user.id));
}

export async function renameOrg(ctx: OrgContext, name: string) {
  requireOrgSettings(ctx);
  await withOrg(ctx.org.id, (tx) => tx.update(organizations).set({ name }).where(eq(organizations.id, ctx.org.id)));
}

export interface Branding {
  primary: string | null;
  secondary: string | null;
  logoData: string | null;
  enabled: boolean;
}

export async function getBranding(ctx: OrgContext): Promise<Branding> {
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .select({ primary: organizations.brandColor, secondary: organizations.brandSecondary, logoData: organizations.logoData, enabled: organizations.brandingEnabled })
      .from(organizations)
      .where(eq(organizations.id, ctx.org.id)),
  );
  return row;
}

export async function saveBranding(ctx: OrgContext, b: Branding) {
  requireOrgSettings(ctx);
  await withOrg(ctx.org.id, (tx) =>
    tx.update(organizations).set({ brandColor: b.primary, brandSecondary: b.secondary, logoData: b.logoData, brandingEnabled: b.enabled }).where(eq(organizations.id, ctx.org.id)),
  );
}

export interface TagRow {
  name: string;
  /** Posts using it. */
  uses: number;
  /** On the organisation's list (otherwise only found on posts). */
  listed: boolean;
}

/** The tag list plus every tag already on a post, with how many posts use each. */
export async function listTags(ctx: OrgContext): Promise<TagRow[]> {
  return withOrg(ctx.org.id, async (tx) => {
    const [listed, used] = await Promise.all([
      tx.select({ name: orgTags.name }).from(orgTags).orderBy(asc(orgTags.name)),
      tx
        .select({ name: sql<string>`t.tag`, uses: sql<number>`count(*)::int` })
        .from(sql`${contentItems}, unnest(${contentItems.tags}) as t(tag)`)
        .groupBy(sql`t.tag`),
    ]);
    const rows = new Map<string, TagRow>();
    for (const l of listed) rows.set(l.name, { name: l.name, uses: 0, listed: true });
    for (const u of used) rows.set(u.name, { name: u.name, uses: u.uses, listed: rows.has(u.name) });
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Names on the organisation's list, for tag suggestions when editing posts. */
export async function tagSuggestions(orgId: string) {
  return (await withOrg(orgId, (tx) => tx.select({ name: orgTags.name }).from(orgTags).orderBy(asc(orgTags.name)))).map((r) => r.name);
}

export async function addTag(ctx: OrgContext, name: string) {
  requireOrgSettings(ctx);
  await withOrg(ctx.org.id, (tx) => tx.insert(orgTags).values({ orgId: ctx.org.id, name }).onConflictDoNothing());
}

/** Renames everywhere: on the list and on every post that has it. */
export async function renameTag(ctx: OrgContext, from: string, to: string) {
  requireOrgSettings(ctx);
  await withOrg(ctx.org.id, async (tx) => {
    await tx.delete(orgTags).where(eq(orgTags.name, from));
    await tx.insert(orgTags).values({ orgId: ctx.org.id, name: to }).onConflictDoNothing();
    // Replace, then drop the duplicate if a post already had the new name.
    await tx
      .update(contentItems)
      .set({ tags: sql`array(select distinct x from unnest(array_replace(${contentItems.tags}, ${from}, ${to})) as x)` })
      .where(sql`${from} = any(${contentItems.tags})`);
  });
}

/** Removes from the list and from every post. */
export async function deleteTag(ctx: OrgContext, name: string) {
  requireOrgSettings(ctx);
  await withOrg(ctx.org.id, async (tx) => {
    await tx.delete(orgTags).where(and(eq(orgTags.orgId, ctx.org.id), eq(orgTags.name, name)));
    await tx.update(contentItems).set({ tags: sql`array_remove(${contentItems.tags}, ${name})` }).where(sql`${name} = any(${contentItems.tags})`);
  });
}
