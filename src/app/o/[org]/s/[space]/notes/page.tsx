import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { NOTE_TEMPLATES } from "@/lib/note-templates";
import { getNote, listNotes, noteSuggestions } from "@/server/notes";
import { getSpaceContext } from "@/server/tenancy";
import { newNote, pin, remove, save } from "./actions";

export const metadata = { title: "Notes" };

/** VW-06: briefs and meeting notes for the space. */
export default async function NotesPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/notes">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const [list, suggestions] = await Promise.all([listNotes(ctx), noteSuggestions(ctx)]);
  const wanted = typeof query.note === "string" ? query.note : list[0]?.id;
  const note = wanted ? await getNote(ctx, wanted) : null;

  return (
    <NotesWorkspace
      base={`/o/${org}/s/${space}/notes`}
      notes={list}
      current={note && { id: note.id, title: note.title, content: note.content, projectId: note.projectId, pinned: note.pinned }}
      canEdit={ctx.can("content.edit")}
      people={suggestions.people}
      posts={suggestions.posts}
      projects={suggestions.projects}
      postBase={`/o/${org}/s/${space}/board`}
      requestTime={ctx.requestTime}
      templates={Object.entries(NOTE_TEMPLATES).map(([key, t]) => ({ key, label: t.label }))}
      create={newNote.bind(null, org, space)}
      save={save.bind(null, org, space)}
      pin={pin.bind(null, org, space)}
      remove={remove.bind(null, org, space)}
    />
  );
}
