"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { StatusResult } from "@/app/o/[org]/s/[space]/settings/statuses/actions";
import type { StatusView } from "@/server/statuses";

const CATEGORY_LABEL = { not_started: "Not started", active: "Active", completed: "Completed", closed: "Closed" } as const;
type Category = keyof typeof CATEGORY_LABEL;
const REVIEW_LABEL = { in_review: "Client review", approved: "Approved by client", changes_requested: "Changes requested" } as const;
const SWATCHES = ["#9CA3AF", "#A78BFA", "#60A5FA", "#F2A93B", "#F472B6", "#F87171", "#34D399", "#6B7280"];

// The colour picker reports every step while dragging; save once it settles.
const colorTimers = new Map<string, ReturnType<typeof setTimeout>>();
function afterPause(id: string, fn: () => void) {
  clearTimeout(colorTimers.get(id));
  colorTimers.set(id, setTimeout(fn, 400));
}

type Patch = { name?: string; color?: string; category?: string; reviewRole?: string | null; autopostEligible?: boolean };

/** ST-01 to ST-05: the content and task status sets for a space. */
export function StatusesClient(props: {
  content: StatusView[];
  task: StatusView[];
  otherSpaces: { id: string; name: string }[];
  templates: { key: string; label: string; description: string }[];
  create: (kind: string, input: { name: string; color: string; category: string }) => Promise<StatusResult>;
  change: (id: string, patch: Patch) => Promise<StatusResult>;
  reorder: (id: string, direction: number) => Promise<StatusResult>;
  remove: (id: string, replacementId: string | null) => Promise<StatusResult>;
  importSet: (kind: string, from: string) => Promise<StatusResult>;
}) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<StatusResult>, done: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { text: done, error: false } : { text: r.error, error: true });
    });

  return (
    <div className="flex flex-col gap-8">
      <p aria-live="polite" className={`min-h-5 text-sm ${message?.error ? "text-danger" : "text-muted"}`}>
        {pending ? "Saving…" : message?.text}
      </p>
      <StatusSet kind="content" title="Content statuses" hint="The Board’s columns for posts. Map the client review steps and choose which statuses can publish automatically." list={props.content} {...props} run={run} pending={pending} />
      <StatusSet kind="task" title="Task statuses" hint="Tasks have their own set, separate from posts. A task in Completed or Closed counts as done." list={props.task} {...props} run={run} pending={pending} />
    </div>
  );
}

function StatusSet({
  kind,
  title,
  hint,
  list,
  otherSpaces,
  templates,
  create,
  change,
  reorder,
  remove,
  importSet,
  run,
  pending,
}: {
  kind: "content" | "task";
  title: string;
  hint: string;
  list: StatusView[];
  otherSpaces: { id: string; name: string }[];
  templates: { key: string; label: string; description: string }[];
  create: (kind: string, input: { name: string; color: string; category: string }) => Promise<StatusResult>;
  change: (id: string, patch: Patch) => Promise<StatusResult>;
  reorder: (id: string, direction: number) => Promise<StatusResult>;
  remove: (id: string, replacementId: string | null) => Promise<StatusResult>;
  importSet: (kind: string, from: string) => Promise<StatusResult>;
  run: (fn: () => Promise<StatusResult>, done: string) => void;
  pending: boolean;
}) {
  const [adding, setAdding] = useState<Category | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<StatusView | null>(null);
  const [replacement, setReplacement] = useState("");
  const [importFrom, setImportFrom] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const total = list.reduce((n, s) => n + s.used, 0);
  const noun = kind === "content" ? "post" : "task";

  return (
    <section aria-labelledby={`${kind}-statuses`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${kind}-statuses`} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="max-w-xl text-sm text-muted">{hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={`Import ${title.toLowerCase()} from`} value={importFrom} onChange={(e) => { setImportFrom(e.target.value); setConfirmImport(false); }} className="h-8 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">Import from…</option>
            <optgroup label="Templates">
              {(kind === "task" ? [{ key: "tasks", label: "To do, Doing, Done", description: "" }, ...templates.filter((t) => t.key === "simple")] : templates).map((t) => (
                <option key={t.key} value={`template:${t.key}`}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            {otherSpaces.length > 0 && (
              <optgroup label="Another space">
                {otherSpaces.map((s) => (
                  <option key={s.id} value={`space:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {importFrom && !confirmImport && (
            <button type="button" onClick={() => setConfirmImport(true)} className={buttonClass("secondary", "sm")}>
              Import
            </button>
          )}
        </div>
      </div>
      {confirmImport && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          This replaces all {list.length} {kind} statuses. {total > 0 && `The ${total} ${noun}${total === 1 ? "" : "s"} move to the status with the same name, or the first one in the same category.`}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              run(() => importSet(kind, importFrom), "Statuses imported.");
              setConfirmImport(false);
              setImportFrom("");
            }}
            className={buttonClass("primary", "sm")}
          >
            Replace statuses
          </button>
          <button type="button" onClick={() => setConfirmImport(false)} className={buttonClass("ghost", "sm")}>
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
          const inCat = list.filter((s) => s.category === cat);
          return (
            <div key={cat} className="overflow-hidden rounded-xl border border-line bg-surface">
              <h3 className="flex items-center justify-between border-b border-line-soft bg-subtle/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {CATEGORY_LABEL[cat]}
                <button type="button" onClick={() => { setAdding(cat); setNewName(""); }} className="normal-case tracking-normal text-ink-2 hover:text-ink">
                  + Add status
                </button>
              </h3>
              <ul className="divide-y divide-line-soft">
                {inCat.map((s, i) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line" style={{ background: s.color }}>
                      <span className="sr-only">Colour of {s.name}</span>
                      <input
                        type="color"
                        defaultValue={s.color}
                        onChange={(e) => {
                          const color = e.target.value;
                          (e.target.parentElement as HTMLElement).style.background = color;
                          afterPause(s.id, () => run(() => change(s.id, { color }), "Colour saved."));
                        }}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <input
                      key={s.name}
                      aria-label={`Name of ${s.name}`}
                      defaultValue={s.name}
                      maxLength={40}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(() => change(s.id, { name: e.target.value }), "Renamed.")}
                      className="h-8 min-w-[140px] flex-1 rounded-md border border-transparent px-2 text-sm font-semibold hover:border-line focus:border-ink-2"
                    />
                    <span className="text-xs text-muted">
                      {s.used} {noun}
                      {s.used === 1 ? "" : "s"}
                    </span>
                    <select aria-label={`Category of ${s.name}`} value={s.category} onChange={(e) => run(() => change(s.id, { category: e.target.value }), "Category changed.")} className="h-8 rounded-md border border-line bg-surface px-1.5 text-sm">
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    {kind === "content" && (
                      <>
                        <select aria-label={`Client review step for ${s.name}`} value={s.reviewRole ?? ""} onChange={(e) => run(() => change(s.id, { reviewRole: e.target.value || null }), "Review step saved.")} className="h-8 rounded-md border border-line bg-surface px-1.5 text-sm">
                          <option value="">No review step</option>
                          {(Object.keys(REVIEW_LABEL) as (keyof typeof REVIEW_LABEL)[]).map((r) => (
                            <option key={r} value={r}>
                              {REVIEW_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs">
                          <input type="checkbox" checked={s.autopostEligible} onChange={(e) => run(() => change(s.id, { autopostEligible: e.target.checked }), "Saved.")} />
                          Can autopost
                        </label>
                      </>
                    )}
                    <span className="flex">
                      <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0 || pending} onClick={() => run(() => reorder(s.id, -1), "Moved.")} className="grid size-7 place-items-center rounded text-muted hover:bg-subtle disabled:opacity-30">
                        ↑
                      </button>
                      <button type="button" aria-label={`Move ${s.name} down`} disabled={i === inCat.length - 1 || pending} onClick={() => run(() => reorder(s.id, 1), "Moved.")} className="grid size-7 place-items-center rounded text-muted hover:bg-subtle disabled:opacity-30">
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${s.name}`}
                        disabled={inCat.length === 1}
                        title={inCat.length === 1 ? "Each category needs at least one status" : undefined}
                        onClick={() => {
                          if (s.used === 0) run(() => remove(s.id, null), `Deleted ${s.name}.`);
                          else {
                            setDeleting(s);
                            setReplacement(list.find((x) => x.id !== s.id && x.category === s.category)?.id ?? "");
                          }
                        }}
                        className="grid size-7 place-items-center rounded text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </span>
                    {deleting?.id === s.id && (
                      <div role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                        Move its {s.used} {noun}
                        {s.used === 1 ? "" : "s"} to
                        <select aria-label="Replacement status" value={replacement} onChange={(e) => setReplacement(e.target.value)} className="h-8 rounded-md border border-line bg-surface px-1.5 text-ink">
                          {list
                            .filter((x) => x.id !== s.id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                        </select>
                        and delete “{s.name}”?
                        <button
                          type="button"
                          disabled={!replacement || pending}
                          onClick={() => {
                            run(() => remove(s.id, replacement), `Deleted ${s.name}.`);
                            setDeleting(null);
                          }}
                          className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white"
                        >
                          Move and delete
                        </button>
                        <button type="button" onClick={() => setDeleting(null)} className="px-2 font-semibold">
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {adding === cat && (
                  <li className="px-3 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newName.trim()) return;
                        run(() => create(kind, { name: newName, color: SWATCHES[(list.length + 1) % SWATCHES.length], category: cat }), `Added ${newName.trim()}.`);
                        setAdding(null);
                      }}
                      className="flex gap-2"
                    >
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder={`New ${CATEGORY_LABEL[cat].toLowerCase()} status`} aria-label="New status name" className="h-8 flex-1 rounded-md border border-line px-2 text-sm" />
                      <button type="submit" className={buttonClass("primary", "sm")}>
                        Add
                      </button>
                      <button type="button" onClick={() => setAdding(null)} className={buttonClass("ghost", "sm")}>
                        Cancel
                      </button>
                    </form>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
