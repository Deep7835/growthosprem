"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { NoteEditor } from "./NoteEditor";

interface NoteListItem {
  id: string;
  title: string;
  excerpt: string;
  text: string;
  projectId: string | null;
  projectName: string | null;
  pinned: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

type SaveResult = { ok: true; savedAt: string; notified: number } | { ok: false; error: string };

export function NotesWorkspace({
  base,
  notes,
  current,
  canEdit,
  people,
  posts,
  projects,
  postBase,
  requestTime,
  templates,
  create,
  save,
  pin,
  remove,
}: {
  base: string;
  notes: NoteListItem[];
  current: { id: string; title: string; content: unknown; projectId: string | null; pinned: boolean } | null;
  canEdit: boolean;
  people: { id: string; name: string }[];
  posts: { id: string; title: string }[];
  projects: { id: string; name: string }[];
  postBase: string;
  requestTime: number;
  templates: { key: string; label: string }[];
  create: (projectId: string | null, template: string) => Promise<void>;
  save: (noteId: string, input: { title?: string; content?: unknown; projectId?: string | null }) => Promise<SaveResult>;
  pin: (noteId: string, pinned: boolean) => Promise<void>;
  remove: (noteId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("");
  const [pending, start] = useTransition();
  const confirm = useRef<HTMLDialogElement>(null);
  const shown = notes.filter(
    (n) =>
      (!project || (project === "none" ? !n.projectId : n.projectId === project)) &&
      (!query || `${n.title}\n${n.text}`.toLowerCase().includes(query.toLowerCase())),
  );
  const ago = (iso: string) => {
    const minutes = Math.max(0, Math.round((requestTime - Date.parse(iso)) / 60000));
    const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    return minutes < 60 ? f.format(-minutes, "minute") : minutes < 2880 ? f.format(-Math.round(minutes / 60), "hour") : f.format(-Math.round(minutes / 1440), "day");
  };

  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-1 flex-col md:flex-row">
      <aside aria-label="Notes" className="flex w-full shrink-0 flex-col gap-3 border-line p-4 md:w-80 md:border-r">
        {canEdit && (
          <details className="relative">
            <summary className={`${buttonClass("primary")} w-full cursor-pointer list-none`}>{pending ? "Creating…" : "+ New note"}</summary>
            <div className="absolute inset-x-0 z-20 mt-1 rounded-xl border border-line bg-surface p-1 shadow-xl">
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => create(project && project !== "none" ? project : null, t.key))}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </details>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
        {projects.length > 0 && (
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">{notes.length ? "No notes match." : "No notes yet."}</li>}
          {shown.map((n) => (
            <li key={n.id}>
              <Link
                href={`${base}?note=${n.id}`}
                aria-current={current?.id === n.id ? "page" : undefined}
                className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 ${current?.id === n.id ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-subtle"}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {n.pinned && <span aria-label="Pinned">📌</span>}
                  <span className="truncate">{n.title || "Untitled note"}</span>
                </span>
                {n.excerpt && n.excerpt !== n.title && <span className="truncate text-[13px] text-muted">{n.excerpt}</span>}
                <span className="text-xs text-faint">
                  {[n.projectName, `Edited ${ago(n.updatedAt)}${n.updatedBy ? ` by ${n.updatedBy}` : ""}`].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 flex-1 p-4 md:p-8">
        {current ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                aria-label="Project"
                defaultValue={current.projectId ?? ""}
                disabled={!canEdit}
                onChange={(e) => start(async () => void (await save(current.id, { projectId: e.target.value || null })))}
                className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="flex-1" />
              {canEdit && (
                <>
                  <button type="button" onClick={() => start(() => pin(current.id, !current.pinned))} className={buttonClass("ghost", "sm")}>
                    {current.pinned ? "Unpin" : "Pin to top"}
                  </button>
                  <button type="button" onClick={() => confirm.current?.showModal()} className={buttonClass("ghost", "sm")}>
                    Delete
                  </button>
                </>
              )}
            </div>
            <NoteEditor
              key={current.id}
              noteId={current.id}
              initialTitle={current.title}
              initialContent={current.content}
              editable={canEdit}
              people={people}
              posts={posts}
              postBase={postBase}
              save={(input) => save(current.id, input)}
            />
            <dialog ref={confirm} aria-labelledby="delete-note" className="m-auto w-[min(420px,92vw)] rounded-2xl bg-surface p-5 text-ink shadow-2xl backdrop:bg-ink/40">
              <h2 id="delete-note" className="font-display text-lg font-bold">
                Delete “{current.title || "Untitled note"}”?
              </h2>
              <p className="mt-2 text-sm text-ink-2">The note is removed for everyone in this space. It can’t be undone.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => confirm.current?.close()} className={buttonClass("ghost")}>
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirm.current?.close();
                    start(() => remove(current.id));
                  }}
                  className={`${buttonClass("primary")} bg-danger hover:bg-danger`}
                >
                  Delete note
                </button>
              </div>
            </dialog>
          </div>
        ) : (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 pt-16 text-center">
            <h2 className="font-display text-2xl font-bold">Briefs and meeting notes, next to the work</h2>
            <p className="text-muted">Write with / commands, @mention teammates so they get notified, and link posts with [[ so everyone can jump to them.</p>
            {canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                {templates.map((t) => (
                  <button key={t.key} type="button" disabled={pending} onClick={() => start(() => create(null, t.key))} className={buttonClass(t.key === "brief" ? "primary" : "secondary")}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
