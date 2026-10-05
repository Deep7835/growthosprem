"use server";

import { and, asc, eq, gte, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { contentItems, insights, placements, socialAccounts, statuses } from "@/db/schema";
import { PLACEMENTS } from "@/lib/placements";
import { logActivity } from "@/server/activity";
import { getSpaceAudit } from "@/server/audit";
import { requireSpaceAction } from "@/server/tenancy";

const spacePath = (org: string, space: string) => `/o/${org}/s/${space}`;

/** "Add to plan" on a recommendation. The statement is recomputed here, never taken from the client. */
export async function toggleRecommendation(org: string, space: string, key: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const result = await getSpaceAudit(ctx);
  if (result.state !== "ready") throw new Error("No audit for this space yet.");
  const rec = result.audit.recommendations.find((r) => r.key === z.string().max(120).parse(key));
  if (!rec) throw new Error("That recommendation is no longer in the audit.");

  await withOrg(ctx.org.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(insights)
      .where(and(eq(insights.spaceId, ctx.space.id), eq(insights.key, rec.key)));
    if (existing) {
      await tx.delete(insights).where(eq(insights.id, existing.id));
    } else {
      await tx.insert(insights).values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        kind: "recommendation",
        key: rec.key,
        statement: rec.title,
        evidence: rec.evidence,
        sourceLabel: "suggestion",
        actionedBy: ctx.user.id,
        actionedAt: new Date(),
      });
    }
  });
  revalidatePath(`${spacePath(org, space)}/audit`);
}

/** Creates the chosen draft-calendar rows as content items in the first "Not started" status. */
export async function addAuditDrafts(org: string, space: string, keys: string[]): Promise<string[]> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const wanted = new Set(z.array(z.string().max(40)).max(50).parse(keys));
  const result = await getSpaceAudit(ctx);
  if (result.state !== "ready") throw new Error("No audit for this space yet.");
  const rows = result.audit.plan.filter((p) => wanted.has(p.key) && !result.onCalendar.includes(p.key));
  if (rows.length === 0) return [];

  const ids = await withOrg(ctx.org.id, async (tx) => {
    const [first] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.category, "not_started"), eq(statuses.appliesTo, "content")))
      .orderBy(asc(statuses.position))
      .limit(1);
    if (!first) throw new Error("This space has no “Not started” status to add drafts to.");
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    const [{ top }] = await tx.select({ top: max(contentItems.position) }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id));

    const created: string[] = [];
    for (const [i, row] of rows.entries()) {
      const [item] = await tx
        .insert(contentItems)
        .values({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          title: row.title,
          statusId: first.id,
          pillar: row.pillar,
          scheduledAt: new Date(row.scheduledAt),
          position: (top ?? 0) + i + 1,
          createdBy: ctx.user.id,
        })
        .returning();
      await tx.insert(placements).values(
        row.placements.map((kind) => ({
          orgId: ctx.org.id,
          contentItemId: item.id,
          kind,
          socialAccountId: accounts.find((a) => a.platform === PLACEMENTS[kind].platform)?.id ?? null,
        })),
      );
      await logActivity(tx, {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        contentItemId: item.id,
        actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
        action: "created from the first audit",
      });
      created.push(item.id);
    }
    return created;
  });
  revalidatePath(spacePath(org, space), "layout");
  return ids;
}

/** Undo for addAuditDrafts: removes drafts this user just created, if nobody has moved them on. */
export async function undoAuditDrafts(org: string, space: string, ids: string[]) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const list = z.array(z.uuid()).max(50).parse(ids);
  if (list.length === 0) return;
  await withOrg(ctx.org.id, async (tx) => {
    const notStarted = await tx
      .select({ id: statuses.id })
      .from(statuses)
      .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.category, "not_started")));
    await tx.delete(contentItems).where(
      and(
        inArray(contentItems.id, list),
        eq(contentItems.spaceId, ctx.space.id),
        eq(contentItems.createdBy, ctx.user.id),
        gte(contentItems.createdAt, new Date(Date.now() - 30 * 60 * 1000)),
        inArray(contentItems.statusId, notStarted.map((s) => s.id)),
      ),
    );
  });
  revalidatePath(spacePath(org, space), "layout");
}
