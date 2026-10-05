import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { NOTE_TEMPLATES } from "@/lib/note-templates";
import { getNote, listNotes, noteSuggestions } from "@/server/notes";
import type { SpaceContext } from "@/server/tenancy";
import { newNote, newProjectNote, pin, remove, save } from "../notes/actions";
import { viewRoot, type Query } from "./root";

/** VW-06: briefs and meeting notes for the space, or one project's. */
export async function NotesView({ ctx, query }: { ctx: SpaceContext; query: Query }) {
  const org = ctx.org.slug;
  const space = ctx.space.slug;
  const [list, suggestions] = await Promise.all([listNotes(ctx), noteSuggestions(ctx)]);
  const wanted = typeof query.note === "string" ? query.note : list[0]?.id;
  const note = wanted ? await getNote(ctx, wanted) : null;

  return (
    <NotesWorkspace
      base={`${viewRoot(ctx)}/notes`}
      notes={list}
      current={note && { id: note.id, title: note.title, content: note.content, projectId: note.projectId, pinned: note.pinned }}
      canEdit={ctx.can("content.edit")}
      people={suggestions.people}
      posts={suggestions.posts}
      projects={suggestions.projects}
      postBase={`/o/${org}/s/${space}/board`}
      requestTime={ctx.requestTime}
      templates={Object.entries(NOTE_TEMPLATES).map(([key, t]) => ({ key, label: t.label }))}
      create={ctx.project ? newProjectNote.bind(null, org, space, ctx.project.id) : newNote.bind(null, org, space)}
      save={save.bind(null, org, space)}
      pin={pin.bind(null, org, space)}
      remove={remove.bind(null, org, space)}
    />
  );
}
