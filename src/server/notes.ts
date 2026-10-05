import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withOrg } from "@/db";
import { contentItems, notes, projects, users } from "@/db/schema";
import { deliver } from "@/notifications/deliver";
import { NOTE_TEMPLATES, type NoteTemplate } from "@/lib/note-templates";
import { excerpt, sanitizeDoc, summarize } from "@/lib/notes";
import { assignableMembers } from "./table";
import type { SpaceContext } from "./tenancy";

export async function listNotes(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx
      .select({ note: notes, projectName: projects.name, editor: users.name })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(users, eq(users.id, notes.updatedBy))
      .where(and(eq(notes.spaceId, ctx.space.id), ctx.project ? eq(notes.projectId, ctx.project.id) : undefined))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));
    return rows.map(({ note, projectName, editor }) => ({
      id: note.id,
      title: note.title,
      excerpt: excerpt(note.text),
      text: note.text.slice(0, 2000),
      projectId: note.projectId,
      projectName,
      pinned: note.pinned,
      updatedAt: note.updatedAt.toISOString(),
      updatedBy: editor,
    }));
  });
}

export async function getNote(ctx: SpaceContext, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await withOrg(ctx.org.id, (tx) => tx.select().from(notes).where(and(eq(notes.id, id), eq(notes.spaceId, ctx.space.id))));
  return row ?? null;
}

/** What the editor offers after "@" and "[[": the space's people and posts. */
export async function noteSuggestions(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const [people, posts, projectList] = await Promise.all([
      assignableMembers(tx, ctx),
      tx
        .select({ id: contentItems.id, title: contentItems.title, scheduledAt: contentItems.scheduledAt })
        .from(contentItems)
        .where(eq(contentItems.spaceId, ctx.space.id))
        .orderBy(desc(contentItems.updatedAt))
        .limit(300),
      tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.spaceId, ctx.space.id)),
    ]);
    return { people, posts: posts.map((p) => ({ id: p.id, title: p.title })), projects: projectList };
  });
}

export async function createNote(ctx: SpaceContext, projectId: string | null, template: NoteTemplate = "blank") {
  const t = NOTE_TEMPLATES[template] ?? NOTE_TEMPLATES.blank;
  const [row] = await withOrg(ctx.org.id, async (tx) => {
    if (projectId) {
      const [p] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.spaceId, ctx.space.id)));
      if (!p) throw new Error("That project isn’t in this space.");
    }
    return tx
      .insert(notes)
      .values({ orgId: ctx.org.id, spaceId: ctx.space.id, projectId, title: t.title, content: t.doc, text: summarize(t.doc).text, createdBy: ctx.user.id, updatedBy: ctx.user.id })
      .returning({ id: notes.id });
  });
  return row.id;
}

/**
 * Autosave (later save wins). People newly @mentioned get a notification (VW-06); mentions
 * of people outside the space and links to other spaces' posts are dropped.
 */
export async function saveNote(ctx: SpaceContext, id: string, input: { title?: string; content?: unknown; projectId?: string | null }, noteHref: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [note] = await tx.select().from(notes).where(and(eq(notes.id, id), eq(notes.spaceId, ctx.space.id)));
    if (!note) throw new Error("This note was deleted.");
    const patch: Partial<typeof notes.$inferInsert> = { updatedAt: new Date(), updatedBy: ctx.user.id };
    if (input.title !== undefined) patch.title = input.title.slice(0, 200);
    if (input.projectId !== undefined) {
      if (input.projectId) {
        const [p] = await tx.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.spaceId, ctx.space.id)));
        if (!p) throw new Error("That project isn’t in this space.");
      }
      patch.projectId = input.projectId;
    }
    let fresh: string[] = [];
    if (input.content !== undefined) {
      const doc = sanitizeDoc(input.content);
      const { text, mentions } = summarize(doc);
      const allowed = new Set((await assignableMembers(tx, ctx)).map((m) => m.id));
      const people = mentions.filter((m) => allowed.has(m));
      patch.content = doc;
      patch.text = text;
      patch.mentionIds = people;
      fresh = people.filter((p) => !note.mentionIds.includes(p) && p !== ctx.user.id);
    }
    await tx.update(notes).set(patch).where(eq(notes.id, id));
    if (fresh.length) {
      const title = (patch.title ?? note.title) || "a note";
      await deliver(tx, fresh, {
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        kind: "mention",
        title: `${ctx.user.name} mentioned you in “${title}”`,
        body: ctx.space.name,
        href: noteHref,
      });
    }
    return { savedAt: patch.updatedAt!.toISOString(), notified: fresh.length };
  });
}

export async function setPinned(ctx: SpaceContext, id: string, pinned: boolean) {
  await withOrg(ctx.org.id, (tx) => tx.update(notes).set({ pinned }).where(and(eq(notes.id, id), eq(notes.spaceId, ctx.space.id))));
}

export async function deleteNote(ctx: SpaceContext, id: string) {
  await withOrg(ctx.org.id, (tx) => tx.delete(notes).where(and(eq(notes.id, id), eq(notes.spaceId, ctx.space.id))));
}
