"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NOTE_TEMPLATES, type NoteTemplate } from "@/lib/note-templates";
import { addNoteComment, createNote, deleteNote, duplicateNote, saveNote, setPinned } from "@/server/notes";
import { requireSpaceAction } from "@/server/tenancy";

const id = z.uuid();
const page = (org: string, space: string) => `/o/${org}/s/${space}/notes`;

export async function newNote(org: string, space: string, projectId: string | null, template: string = "blank") {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const kind = (Object.keys(NOTE_TEMPLATES) as NoteTemplate[]).includes(template as NoteTemplate) ? (template as NoteTemplate) : "blank";
  const note = await createNote(ctx, projectId ? id.parse(projectId) : null, kind);
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  redirect(`${page(org, space)}?note=${note}`);
}

/** PJ-02: a note made in a project's Notes view belongs to that project and opens there. */
export async function newProjectNote(org: string, space: string, projectId: string, _chosen: string | null, template: string = "blank") {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const kind = (Object.keys(NOTE_TEMPLATES) as NoteTemplate[]).includes(template as NoteTemplate) ? (template as NoteTemplate) : "blank";
  const note = await createNote(ctx, id.parse(projectId), kind);
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  redirect(`/o/${org}/s/${space}/p/${projectId}/notes?note=${note}`);
}

export async function save(org: string, space: string, noteId: string, input: { title?: string; content?: unknown; projectId?: string | null }) {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const result = await saveNote(ctx, id.parse(noteId), input, `${page(org, space)}?note=${noteId}`);
    revalidatePath(`/o/${org}/s/${space}`, "layout");
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn’t save." };
  }
}

export async function pin(org: string, space: string, noteId: string, pinned: boolean) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await setPinned(ctx, id.parse(noteId), pinned);
  revalidatePath(`/o/${org}/s/${space}`, "layout");
}

export async function remove(org: string, space: string, noteId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await deleteNote(ctx, id.parse(noteId));
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  redirect(page(org, space));
}

export async function duplicate(org: string, space: string, noteId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const copy = await duplicateNote(ctx, id.parse(noteId));
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  redirect(`${page(org, space)}?note=${copy}`);
}

export async function comment(org: string, space: string, noteId: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const text = z.string().trim().min(1, "Write something first.").max(5000).parse(body);
    await addNoteComment(ctx, id.parse(noteId), text, `${page(org, space)}?note=${noteId}`);
    revalidatePath(`/o/${org}/s/${space}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "That comment isn’t valid.") : e instanceof Error ? e.message : "Couldn’t post it." };
  }
}
