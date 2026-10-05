import "server-only";
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentItems, spaceMembers, spaces, statuses, tasks } from "@/db/schema";
import { STATUS_TEMPLATES, TASK_STATUSES, type ReviewRole, type StatusCategory, type StatusSeed, type StatusTemplateKey } from "@/lib/status-templates";
import type { SpaceContext } from "./tenancy";

// Status management (PRD 6.4, ST-01 to ST-06). Content and tasks each have their own set (ST-03).

export type AppliesTo = "content" | "task";
export const CATEGORIES: StatusCategory[] = ["not_started", "active", "completed", "closed"];

type Status = typeof statuses.$inferSelect;

async function setOf(tx: Tx, spaceId: string, appliesTo: AppliesTo) {
  return tx
    .select()
    .from(statuses)
    .where(and(eq(statuses.spaceId, spaceId), eq(statuses.appliesTo, appliesTo)))
    .orderBy(asc(statuses.position));
}

async function statusIn(tx: Tx, ctx: SpaceContext, id: string) {
  const [s] = await tx.select().from(statuses).where(and(eq(statuses.id, id), eq(statuses.spaceId, ctx.space.id)));
  if (!s) throw new Error("That status isn’t in this space any more.");
  return s;
}

const usageTable = (appliesTo: AppliesTo) => (appliesTo === "content" ? contentItems : tasks);

async function usage(tx: Tx, appliesTo: AppliesTo, ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const t = usageTable(appliesTo);
  const rows = await tx.select({ id: t.statusId, n: count() }).from(t).where(inArray(t.statusId, ids)).groupBy(t.statusId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

/** Both sets with how many posts or tasks use each status, and the spaces to import from. */
export async function loadStatuses(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [content, task] = await Promise.all([setOf(tx, ctx.space.id, "content"), setOf(tx, ctx.space.id, "task")]);
    const [contentUse, taskUse] = await Promise.all([usage(tx, "content", content.map((s) => s.id)), usage(tx, "task", task.map((s) => s.id))]);
    const all = await tx.select({ id: spaces.id, name: spaces.name }).from(spaces).where(and(ne(spaces.id, ctx.space.id), isNull(spaces.deletedAt))).orderBy(asc(spaces.name));
    let mine = all;
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      const memberOf = new Set((await tx.select({ spaceId: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, ctx.user.id))).map((m) => m.spaceId));
      mine = all.filter((a) => memberOf.has(a.id));
    }
    const view = (list: Status[], use: Map<string, number>) =>
      list.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category, reviewRole: s.reviewRole, autopostEligible: s.autopostEligible, used: use.get(s.id) ?? 0 }));
    return { content: view(content, contentUse), task: view(task, taskUse), otherSpaces: mine };
  });
}

export type StatusView = Awaited<ReturnType<typeof loadStatuses>>["content"][number];

function cleanName(name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) throw new Error("Give the status a name.");
  return n;
}
const cleanColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#9CA3AF");

export async function addStatus(ctx: SpaceContext, appliesTo: AppliesTo, input: { name: string; color: string; category: StatusCategory }) {
  if (!CATEGORIES.includes(input.category)) throw new Error("Pick a category.");
  return withOrg(ctx.org.id, async (tx) => {
    const list = await setOf(tx, ctx.space.id, appliesTo);
    const name = cleanName(input.name);
    if (list.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`There’s already a status called “${name}”.`);
    // A new status goes at the end of its category (renumber keeps categories together).
    const [row] = await tx
      .insert(statuses)
      .values({ orgId: ctx.org.id, spaceId: ctx.space.id, name, color: cleanColor(input.color), category: input.category, appliesTo, position: 10_000 })
      .returning();
    await renumber(tx, ctx.space.id, appliesTo);
    return row;
  });
}

/** Positions 0, 1, 2… in category order, then current order (tasks start at 100). */
async function renumber(tx: Tx, spaceId: string, appliesTo: AppliesTo) {
  const list = await setOf(tx, spaceId, appliesTo);
  const sorted = [...list].sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.position - b.position);
  const start = appliesTo === "task" ? 100 : 0;
  for (const [i, s] of sorted.entries()) if (s.position !== start + i) await tx.update(statuses).set({ position: start + i }).where(eq(statuses.id, s.id));
}

export async function updateStatus(
  ctx: SpaceContext,
  id: string,
  patch: { name?: string; color?: string; category?: StatusCategory; reviewRole?: ReviewRole; autopostEligible?: boolean },
) {
  await withOrg(ctx.org.id, async (tx) => {
    const s = await statusIn(tx, ctx, id);
    const list = await setOf(tx, ctx.space.id, s.appliesTo);
    const set: Partial<Status> = {};
    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      if (list.some((x) => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`There’s already a status called “${name}”.`);
      set.name = name;
    }
    if (patch.color !== undefined) set.color = cleanColor(patch.color);
    if (patch.category !== undefined && patch.category !== s.category) {
      if (!CATEGORIES.includes(patch.category)) throw new Error("Pick a category.");
      if (list.filter((x) => x.category === s.category).length === 1) throw new Error(`Each category needs at least one status, and “${s.name}” is the only one in its category.`);
      set.category = patch.category;
    }
    if (s.appliesTo === "content" && patch.reviewRole !== undefined) {
      // Each review step maps to one status (SH-06): taking it moves it here.
      if (patch.reviewRole) await tx.update(statuses).set({ reviewRole: null }).where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.reviewRole, patch.reviewRole)));
      set.reviewRole = patch.reviewRole;
    }
    if (s.appliesTo === "content" && patch.autopostEligible !== undefined) set.autopostEligible = patch.autopostEligible;
    if (Object.keys(set).length) await tx.update(statuses).set(set).where(eq(statuses.id, s.id));
    if (set.category) await renumber(tx, ctx.space.id, s.appliesTo);
    // Tasks' done flag follows their status's category.
    if (s.appliesTo === "task" && set.category) {
      await tx.update(tasks).set({ done: set.category === "completed" || set.category === "closed" }).where(eq(tasks.statusId, s.id));
    }
  });
}

/** Moves a status one place up or down within its category. */
export async function moveStatus(ctx: SpaceContext, id: string, direction: -1 | 1) {
  await withOrg(ctx.org.id, async (tx) => {
    const s = await statusIn(tx, ctx, id);
    const peers = (await setOf(tx, ctx.space.id, s.appliesTo)).filter((x) => x.category === s.category);
    const i = peers.findIndex((x) => x.id === s.id);
    const other = peers[i + direction];
    if (!other) return;
    await tx.update(statuses).set({ position: other.position }).where(eq(statuses.id, s.id));
    await tx.update(statuses).set({ position: s.position }).where(eq(statuses.id, other.id));
  });
}

/** ST-05: a status in use needs a replacement first; the last of a category can't go (ST-01). */
export async function deleteStatus(ctx: SpaceContext, id: string, replacementId: string | null) {
  await withOrg(ctx.org.id, async (tx) => {
    const s = await statusIn(tx, ctx, id);
    const list = await setOf(tx, ctx.space.id, s.appliesTo);
    if (list.filter((x) => x.category === s.category).length === 1) throw new Error(`Each category needs at least one status, and “${s.name}” is the only one in its category.`);
    const used = (await usage(tx, s.appliesTo, [s.id])).get(s.id) ?? 0;
    if (used > 0) {
      const target = list.find((x) => x.id === replacementId && x.id !== s.id);
      if (!target) throw new Error(`Choose where the ${used} ${s.appliesTo === "content" ? "post" : "task"}${used === 1 ? "" : "s"} in “${s.name}” should go.`);
      if (s.appliesTo === "content") await tx.update(contentItems).set({ statusId: target.id, updatedAt: new Date() }).where(eq(contentItems.statusId, s.id));
      else await tx.update(tasks).set({ statusId: target.id, done: target.category === "completed" || target.category === "closed", updatedAt: new Date() }).where(eq(tasks.statusId, s.id));
    }
    await tx.delete(statuses).where(eq(statuses.id, s.id));
    await renumber(tx, ctx.space.id, s.appliesTo);
  });
}

/**
 * ST-04: replaces a set with a template's or another space's. Work moves to the new status with the
 * same name, otherwise the first one in the same category.
 */
export async function importStatuses(ctx: SpaceContext, appliesTo: AppliesTo, source: { template?: StatusTemplateKey | "tasks"; spaceId?: string }) {
  await withOrg(ctx.org.id, async (tx) => {
    let seeds: { name: string; color: string; category: StatusCategory; reviewRole: ReviewRole; autopost: boolean }[];
    if (source.spaceId) {
      const [other] = await tx.select().from(spaces).where(eq(spaces.id, source.spaceId));
      if (!other || other.id === ctx.space.id) throw new Error("Pick another space.");
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        const [member] = await tx.select().from(spaceMembers).where(and(eq(spaceMembers.spaceId, other.id), eq(spaceMembers.userId, ctx.user.id)));
        if (!member) throw new Error("You’re not in that space.");
      }
      seeds = (await setOf(tx, other.id, appliesTo)).map((s) => ({ name: s.name, color: s.color, category: s.category, reviewRole: s.reviewRole, autopost: s.autopostEligible }));
    } else {
      const key = source.template;
      const template: readonly StatusSeed[] | undefined = key === "tasks" ? TASK_STATUSES : key && key in STATUS_TEMPLATES ? STATUS_TEMPLATES[key as StatusTemplateKey].statuses : undefined;
      if (!template) throw new Error("Pick a template.");
      seeds = template.map(([name, color, category, reviewRole, autopost]) => ({ name, color, category, reviewRole: appliesTo === "content" ? reviewRole : null, autopost: appliesTo === "content" && Boolean(autopost) }));
    }
    for (const c of CATEGORIES) if (!seeds.some((s) => s.category === c)) throw new Error("That set is missing a category, so it can’t be used here.");

    const old = await setOf(tx, ctx.space.id, appliesTo);
    // Free the review roles before the new statuses take them.
    if (appliesTo === "content") await tx.update(statuses).set({ reviewRole: null }).where(inArray(statuses.id, old.map((s) => s.id)));
    const start = appliesTo === "task" ? 100 : 0;
    const added = await tx
      .insert(statuses)
      .values(
        seeds.map((s, i) => ({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          name: s.name,
          color: s.color,
          category: s.category,
          appliesTo,
          position: start + i,
          reviewRole: appliesTo === "content" ? s.reviewRole : null,
          autopostEligible: appliesTo === "content" ? s.autopost : false,
        })),
      )
      .returning();
    for (const o of old) {
      const target = added.find((a) => a.name.toLowerCase() === o.name.toLowerCase()) ?? added.find((a) => a.category === o.category)!;
      if (appliesTo === "content") await tx.update(contentItems).set({ statusId: target.id }).where(eq(contentItems.statusId, o.id));
      else await tx.update(tasks).set({ statusId: target.id, done: target.category === "completed" || target.category === "closed" }).where(eq(tasks.statusId, o.id));
    }
    if (old.length) await tx.delete(statuses).where(inArray(statuses.id, old.map((s) => s.id)));
  });
}
