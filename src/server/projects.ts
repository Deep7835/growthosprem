import "server-only";
import { and, asc, count, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentItems, contentMedia, mediaAssets, mediaFolders, notes, projects, tasks } from "@/db/schema";
import { assetPrefix, getStorage } from "@/storage";
import type { SpaceContext } from "./tenancy";

// Projects (PRD 6.5): campaigns and workstreams inside a space. Managed in Space settings.

export const PROJECT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];

export interface ProjectInput {
  name: string;
  goal?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  color?: string | null;
}

function clean(input: ProjectInput) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("Give the project a name.");
  const date = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const startsOn = date(input.startsOn);
  const endsOn = date(input.endsOn);
  if (startsOn && endsOn && endsOn < startsOn) throw new Error("The end date is before the start date.");
  const color = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : null;
  return { name, goal: input.goal?.trim().slice(0, 300) || null, startsOn, endsOn, color };
}

async function projectIn(ctx: SpaceContext, tx: Tx, id: string) {
  const [p] = await tx.select().from(projects).where(and(eq(projects.id, id), eq(projects.spaceId, ctx.space.id)));
  if (!p) throw new Error("That project isn’t in this space any more.");
  return p;
}

/** Settings › Projects: every project with what's in it. */
export async function listProjects(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx.select().from(projects).where(eq(projects.spaceId, ctx.space.id)).orderBy(asc(projects.name));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const [posts, taskRows, noteRows, folders] = await Promise.all([
      tx.select({ id: contentItems.projectId, n: count() }).from(contentItems).where(inArray(contentItems.projectId, ids)).groupBy(contentItems.projectId),
      tx.select({ id: tasks.projectId, n: count() }).from(tasks).where(inArray(tasks.projectId, ids)).groupBy(tasks.projectId),
      tx.select({ id: notes.projectId, n: count() }).from(notes).where(inArray(notes.projectId, ids)).groupBy(notes.projectId),
      tx
        .select({ projectId: mediaFolders.projectId, folderId: mediaFolders.id, n: count(mediaAssets.id) })
        .from(mediaFolders)
        .leftJoin(mediaAssets, eq(mediaAssets.folderId, mediaFolders.id))
        .where(inArray(mediaFolders.projectId, ids))
        .groupBy(mediaFolders.projectId, mediaFolders.id),
    ]);
    const num = (list: { id: string | null; n: number }[], id: string) => list.find((x) => x.id === id)?.n ?? 0;
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      goal: p.goal,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      color: p.color,
      archived: Boolean(p.archivedAt),
      counts: {
        content: num(posts, p.id),
        tasks: num(taskRows, p.id),
        notes: num(noteRows, p.id),
        media: folders.filter((f) => f.projectId === p.id).reduce((a, f) => a + f.n, 0),
      },
      hasFolder: folders.some((f) => f.projectId === p.id),
    }));
  });
}

export type ProjectRow = Awaited<ReturnType<typeof listProjects>>[number];

/** PJ-01, PJ-03: a new project, with its own media folder unless switched off. */
export async function createProject(ctx: SpaceContext, input: ProjectInput, withFolder: boolean) {
  const values = clean(input);
  return withOrg(ctx.org.id, async (tx) => {
    const [p] = await tx.insert(projects).values({ orgId: ctx.org.id, spaceId: ctx.space.id, ...values }).returning();
    if (withFolder) await tx.insert(mediaFolders).values({ orgId: ctx.org.id, spaceId: ctx.space.id, name: p.name, projectId: p.id });
    return p;
  });
}

/** Settings: rename and the optional fields. The project's media folder follows the name. */
export async function updateProject(ctx: SpaceContext, id: string, input: ProjectInput) {
  const values = clean(input);
  await withOrg(ctx.org.id, async (tx) => {
    const p = await projectIn(ctx, tx, id);
    await tx.update(projects).set(values).where(eq(projects.id, p.id));
    if (values.name !== p.name) await tx.update(mediaFolders).set({ name: values.name }).where(and(eq(mediaFolders.projectId, p.id), eq(mediaFolders.name, p.name)));
  });
}

/** PJ-04: a copy of the project's settings (not its content), with a folder if the original had one. */
export async function duplicateProject(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const p = await projectIn(ctx, tx, id);
    const taken = new Set((await tx.select({ name: projects.name }).from(projects).where(eq(projects.spaceId, ctx.space.id))).map((r) => r.name));
    let name = `${p.name} (copy)`;
    for (let n = 2; taken.has(name); n++) name = `${p.name} (copy ${n})`;
    const [copy] = await tx
      .insert(projects)
      .values({ orgId: ctx.org.id, spaceId: ctx.space.id, name: name.slice(0, 80), goal: p.goal, startsOn: p.startsOn, endsOn: p.endsOn, color: p.color })
      .returning();
    const [folder] = await tx.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.projectId, p.id)).limit(1);
    if (folder) await tx.insert(mediaFolders).values({ orgId: ctx.org.id, spaceId: ctx.space.id, name: copy.name, projectId: copy.id });
    return copy;
  });
}

/** PJ-04: archived projects leave the sidebar and pickers; their work stays where it is. */
export async function setArchived(ctx: SpaceContext, id: string, archived: boolean) {
  await withOrg(ctx.org.id, async (tx) => {
    const p = await projectIn(ctx, tx, id);
    await tx.update(projects).set({ archivedAt: archived ? new Date() : null }).where(eq(projects.id, p.id));
  });
}

/** PJ-05: what deleting would touch, so the dialog can warn about media used elsewhere. */
export async function deletePreview(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const p = await projectIn(ctx, tx, id);
    const folderIds = (await tx.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.projectId, p.id))).map((f) => f.id);
    const assets = folderIds.length ? await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.folderId, folderIds)) : [];
    const projectPosts = tx.select({ id: contentItems.id }).from(contentItems).where(eq(contentItems.projectId, p.id));
    const elsewhere = assets.length
      ? await tx
          .select({ title: contentItems.title })
          .from(contentMedia)
          .innerJoin(contentItems, eq(contentItems.id, contentMedia.contentItemId))
          .where(and(inArray(contentMedia.mediaAssetId, assets.map((a) => a.id)), notInArray(contentItems.id, projectPosts)))
      : [];
    return { usedElsewhere: [...new Set(elsewhere.map((e) => e.title))] };
  });
}

/**
 * PJ-05: deletes the project after the name is typed exactly. Each kind of work is deleted only
 * when chosen; the rest stays in the space without a project.
 */
export async function deleteProject(ctx: SpaceContext, id: string, typedName: string, also: { content: boolean; tasks: boolean; notes: boolean; media: boolean }) {
  const removed = await withOrg(ctx.org.id, async (tx) => {
    const p = await projectIn(ctx, tx, id);
    if (typedName.trim() !== p.name) throw new Error("Type the project’s name exactly to delete it.");
    const folderIds = (await tx.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.projectId, p.id))).map((f) => f.id);
    let assetIds: string[] = [];
    if (also.media && folderIds.length) {
      assetIds = (await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.folderId, folderIds))).map((a) => a.id);
      if (assetIds.length) await tx.delete(mediaAssets).where(inArray(mediaAssets.id, assetIds));
      await tx.delete(mediaFolders).where(inArray(mediaFolders.id, folderIds));
    }
    if (also.tasks) await tx.delete(tasks).where(eq(tasks.projectId, p.id));
    if (also.notes) await tx.delete(notes).where(eq(notes.projectId, p.id));
    if (also.content) await tx.delete(contentItems).where(eq(contentItems.projectId, p.id));
    // Kept folders keep their files, as ordinary folders in the space.
    await tx.update(mediaFolders).set({ projectId: null }).where(and(eq(mediaFolders.projectId, p.id), isNotNull(mediaFolders.projectId)));
    await tx.delete(projects).where(eq(projects.id, p.id));
    return assetIds;
  });
  const storage = getStorage();
  for (const assetId of removed) await storage.deletePrefix(assetPrefix(ctx.org.id, ctx.space.id, assetId));
}
