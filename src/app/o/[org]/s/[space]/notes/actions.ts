"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NOTE_TEMPLATES, type NoteTemplate } from "@/lib/note-templates";
import { createNote, deleteNote, saveNote, setPinned } from "@/server/notes";
import { requireSpaceAction } from "@/server/tenancy";

const id = z.uuid();
const page = (org: string, space: string) => `/o/${org}/s/${space}/notes`;

export async function newNote(org: string, space: string, projectId: string | null, template: string = "blank") {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const kind = (Object.keys(NOTE_TEMPLATES) as NoteTemplate[]).includes(template as NoteTemplate) ? (template as NoteTemplate) : "blank";
  const note = await createNote(ctx, projectId ? id.parse(projectId) : null, kind);
  revalidatePath(page(org, space));
  redirect(`${page(org, space)}?note=${note}`);
}

export async function save(org: string, space: string, noteId: string, input: { title?: string; content?: unknown; projectId?: string | null }) {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const result = await saveNote(ctx, id.parse(noteId), input, `${page(org, space)}?note=${noteId}`);
    revalidatePath(page(org, space));
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn’t save." };
  }
}

export async function pin(org: string, space: string, noteId: string, pinned: boolean) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await setPinned(ctx, id.parse(noteId), pinned);
  revalidatePath(page(org, space));
}

export async function remove(org: string, space: string, noteId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  await deleteNote(ctx, id.parse(noteId));
  revalidatePath(page(org, space));
  redirect(page(org, space));
}
