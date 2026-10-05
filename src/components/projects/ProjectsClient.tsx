"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { ProjectResult } from "@/app/o/[org]/s/[space]/settings/projects/actions";
import type { ProjectRow } from "@/server/projects";

type Values = { name: string; goal: string; startsOn: string; endsOn: string; color: string };
type Also = { content: boolean; tasks: boolean; notes: boolean; media: boolean };

const dateText = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** PJ-01, PJ-03 to PJ-05: Space settings › Projects. */
export function ProjectsClient(props: {
  base: string;
  projects: ProjectRow[];
  colors: string[];
  canManage: boolean;
  add: (values: Values, withFolder: boolean) => Promise<ProjectResult<{ id: string; href: string }>>;
  edit: (id: string, values: Values) => Promise<ProjectResult>;
  copy: (id: string) => Promise<ProjectResult<{ id: string }>>;
  archive: (id: string, archived: boolean) => Promise<ProjectResult>;
  preview: (id: string) => Promise<ProjectResult<{ usedElsewhere: string[] }>>;
  remove: (id: string, typedName: string, also: Also) => Promise<ProjectResult>;
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; project: ProjectRow } | { mode: "delete"; project: ProjectRow; usedElsewhere: string[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = props.projects.filter((p) => showArchived || !p.archived);
  const archivedCount = props.projects.filter((p) => p.archived).length;

  const act = <T,>(fn: () => Promise<ProjectResult<T>>, done: string, then?: (r: { ok: true } & T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMessage(r.error);
      setMessage(done);
      then?.(r);
    });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted">Campaigns and workstreams in this space, such as a Diwali campaign or a menu launch. Each has its own Board, Table, Calendar, Previews and Notes.</p>
        </div>
        {props.canManage && (
          <button type="button" onClick={() => setDialog({ mode: "new" })} className={buttonClass("primary", "sm")}>
            + New project
          </button>
        )}
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-live="polite" className="text-muted">
          {pending ? "Working…" : message}
        </p>
        {archivedCount > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived projects ({archivedCount})
          </label>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <strong>No projects yet</strong>
          <p className="mt-1 text-sm text-muted">Group a campaign’s posts, tasks, notes and media in one place.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {shown.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${p.archived ? "bg-subtle/60" : ""}`}>
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: p.color ?? "#9CA3AF" }} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`${props.base}/p/${p.id}/board`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  {p.archived && <span className="rounded-full bg-line-soft px-2 text-xs font-semibold text-muted">Archived</span>}
                </p>
                <p className="text-[13px] text-muted">
                  {[
                    p.goal,
                    p.startsOn || p.endsOn ? `${p.startsOn ? dateText(p.startsOn) : "…"} – ${p.endsOn ? dateText(p.endsOn) : "…"}` : null,
                    `${p.counts.content} post${p.counts.content === 1 ? "" : "s"}, ${p.counts.tasks} task${p.counts.tasks === 1 ? "" : "s"}, ${p.counts.notes} note${p.counts.notes === 1 ? "" : "s"}${p.hasFolder ? `, ${p.counts.media} file${p.counts.media === 1 ? "" : "s"}` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {props.canManage && (
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setDialog({ mode: "edit", project: p })} className={buttonClass("ghost", "sm")}>
                    Settings
                  </button>
                  <button type="button" disabled={pending} onClick={() => act(() => props.copy(p.id), `Duplicated ${p.name}.`)} className={buttonClass("ghost", "sm")}>
                    Duplicate
                  </button>
                  <button type="button" disabled={pending} onClick={() => act(() => props.archive(p.id, !p.archived), p.archived ? `Restored ${p.name}.` : `Archived ${p.name}.`)} className={buttonClass("ghost", "sm")}>
                    {p.archived ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => props.preview(p.id), "", (r) => setDialog({ mode: "delete", project: p, usedElsewhere: r.usedElsewhere }))}
                    className={`${buttonClass("ghost", "sm")} hover:text-danger`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && dialog.mode !== "delete" && (
        <ProjectDialog
          project={dialog.mode === "edit" ? dialog.project : null}
          colors={props.colors}
          onClose={() => setDialog(null)}
          onSave={async (values, withFolder, open) => {
            if (dialog.mode === "edit") {
              const r = await props.edit(dialog.project.id, values);
              if (!r.ok) return r.error;
              setMessage("Saved.");
            } else {
              const r = await props.add(values, withFolder);
              if (!r.ok) return r.error;
              setMessage(`Created ${values.name.trim()}.`);
              if (open) router.push(r.href);
            }
            setDialog(null);
            return null;
          }}
        />
      )}
      {dialog?.mode === "delete" && (
        <DeleteDialog
          project={dialog.project}
          usedElsewhere={dialog.usedElsewhere}
          pending={pending}
          onClose={() => setDialog(null)}
          onDelete={(typed, also) => act(() => props.remove(dialog.project.id, typed, also), `Deleted ${dialog.project.name}.`, () => setDialog(null))}
        />
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh]" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ProjectDialog({
  project,
  colors,
  onClose,
  onSave,
}: {
  project: ProjectRow | null;
  colors: string[];
  onClose: () => void;
  /** Returns an error to show, or null when it worked. */
  onSave: (values: Values, withFolder: boolean, open: boolean) => Promise<string | null>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (open: boolean) => start(async () => setError(await onSave(values, withFolder, open)));
  const [values, setValues] = useState<Values>({
    name: project?.name ?? "",
    goal: project?.goal ?? "",
    startsOn: project?.startsOn ?? "",
    endsOn: project?.endsOn ?? "",
    color: project?.color ?? colors[0],
  });
  const [withFolder, setWithFolder] = useState(true);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value });
  const field = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm";
  const valid = values.name.trim().length > 0;

  return (
    <Modal title={project ? "Project settings" : "Create your new project"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit(true);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Name
          <input autoFocus required maxLength={80} value={values.name} onChange={set("name")} placeholder="e.g. Diwali campaign, Menu launch" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Goal <span className="font-normal text-muted">(optional)</span>
          <input maxLength={300} value={values.goal} onChange={set("goal")} placeholder="e.g. Sell out the Diwali sweets box" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Starts
            <input type="date" value={values.startsOn} onChange={set("startsOn")} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Ends
            <input type="date" value={values.endsOn} min={values.startsOn || undefined} onChange={set("endsOn")} className={field} />
          </label>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">Colour</legend>
          <div className="flex gap-2">
            {colors.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="color" value={c} checked={values.color === c} onChange={set("color")} className="peer sr-only" />
                <span aria-label={c} className="block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus" style={{ background: c }} />
              </label>
            ))}
          </div>
        </fieldset>
        {!project && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withFolder} onChange={(e) => setWithFolder(e.target.checked)} />
            Create a media folder for this project
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          {project ? (
            <button type="submit" disabled={!valid || pending} className={buttonClass("primary")}>
              Save
            </button>
          ) : (
            <>
              <button type="button" disabled={!valid || pending} onClick={() => submit(false)} className={buttonClass("secondary")}>
                Create only
              </button>
              <button type="submit" disabled={!valid || pending} className={buttonClass("primary")}>
                Create and open
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  project,
  usedElsewhere,
  pending,
  onClose,
  onDelete,
}: {
  project: ProjectRow;
  usedElsewhere: string[];
  pending: boolean;
  onClose: () => void;
  onDelete: (typed: string, also: Also) => void;
}) {
  const [also, setAlso] = useState<Also>({ content: false, tasks: false, notes: false, media: false });
  const [typed, setTyped] = useState("");
  const c = project.counts;
  const options: [keyof Also, string, number][] = [
    ["content", "posts", c.content],
    ["tasks", "tasks", c.tasks],
    ["notes", "notes", c.notes],
    ["media", "media files in its folder", c.media],
  ];

  return (
    <Modal title={`Delete ${project.name}?`} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">Anything you don’t tick stays in the space without a project.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">Also delete</legend>
          {options.map(([key, label, n]) => (
            <label key={key} className={`flex items-center gap-2 ${n === 0 ? "text-muted" : ""}`}>
              <input type="checkbox" checked={also[key]} disabled={n === 0} onChange={(e) => setAlso({ ...also, [key]: e.target.checked })} />
              Its {n} {label}
            </label>
          ))}
        </fieldset>
        {also.media && usedElsewhere.length > 0 && (
          <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">
            Some of these files are also used in {usedElsewhere.slice(0, 3).map((t) => `“${t}”`).join(", ")}
            {usedElsewhere.length > 3 ? ` and ${usedElsewhere.length - 3} more` : ""}. They’ll be removed from those posts too.
          </p>
        )}
        <label className="flex flex-col gap-1 font-semibold">
          <span>
            Type <span className="rounded bg-subtle px-1 font-mono">{project.name}</span> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-10 rounded-lg border border-line px-3 font-normal" />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" disabled={typed !== project.name || pending} onClick={() => onDelete(typed, also)} className={`${buttonClass("primary")} bg-danger hover:bg-danger disabled:bg-line`}>
            Delete project
          </button>
        </div>
      </div>
    </Modal>
  );
}
