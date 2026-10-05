"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Avatar, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { isDoneCategory, localInput, PRIORITIES, type ChecklistItem } from "@/lib/tasks";
import type { TaskDetail } from "@/server/tasks";
import type { TaskResult } from "@/app/o/[org]/s/[space]/task-actions";
import { DueChip } from "./bits";

type Change = { title?: string; description?: string; statusId?: string; done?: boolean; assigneeId?: string | null; due?: string; priority?: string; checklist?: ChecklistItem[] };

const newId = () => Math.random().toString(36).slice(2, 10);

/** TK-01: one task with its status, assignee, due date, priority, checklist, description and comments. */
export function TaskPanel({
  detail,
  timeZone,
  canEdit,
  closeHref,
  postHref,
  now,
  edit,
  remove,
  comment,
}: {
  detail: TaskDetail;
  timeZone: string;
  canEdit: boolean;
  closeHref: string;
  postHref: string | null;
  now: number;
  edit: (change: Change) => Promise<TaskResult>;
  remove: () => Promise<TaskResult>;
  comment: (body: string) => Promise<TaskResult>;
}) {
  const router = useRouter();
  const { task } = detail;
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist);
  const [newItem, setNewItem] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  // Its own transition, so a field saving elsewhere never blocks sending a comment.
  const [sending, startSend] = useTransition();
  const close = useCallback(() => router.push(closeHref, { scroll: false }), [router, closeHref]);

  // Esc closes the task first, not the post panel underneath it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[aria-label="Search"][role="dialog"]')) return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const save = (change: Change, done = "Saved") =>
    start(async () => {
      setStatus("Saving…");
      const r = await edit(change);
      setStatus(r.ok ? done : r.error);
    });

  const setList = (next: ChecklistItem[]) => {
    setChecklist(next);
    save({ checklist: next });
  };

  const current = detail.statuses.find((s) => s.id === task.statusId);
  const isDone = current ? isDoneCategory(current.category) : task.done;
  const checked = checklist.filter((c) => c.done).length;
  const field = "h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm disabled:bg-subtle";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 md:p-8">
      <button type="button" aria-label="Close task" className="fixed inset-0 cursor-default" onClick={() => close()} />
      <div role="dialog" aria-modal="true" aria-label={`Task: ${task.title}`} className="relative w-full max-w-3xl rounded-2xl bg-surface shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="min-w-0 truncate text-sm text-muted">
            Task ·{" "}
            {detail.post && postHref ? (
              <Link href={postHref} scroll={false} className="font-semibold text-ink-2 hover:underline">
                {detail.post.title}
              </Link>
            ) : detail.project ? (
              <span className="font-semibold text-ink-2">{detail.project.name}</span>
            ) : (
              "Space task"
            )}
          </p>
          <div className="flex items-center gap-2">
            <span aria-live="polite" className="text-xs text-muted">
              {pending ? "Saving…" : status}
            </span>
            {canEdit && (
              <button type="button" onClick={() => save({ done: !isDone }, isDone ? "Reopened" : "Done")} className={buttonClass(isDone ? "secondary" : "primary", "sm")}>
                {isDone ? "Reopen" : "✓ Mark done"}
              </button>
            )}
            <button type="button" onClick={() => close()} aria-label="Close" className={buttonClass("ghost", "sm")}>
              ✕
            </button>
          </div>
        </header>

        <div className="grid gap-6 p-5 md:grid-cols-[1fr_240px]">
          <div className="flex min-w-0 flex-col gap-5">
            <input
              aria-label="Task title"
              value={title}
              readOnly={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && save({ title })}
              className={`w-full rounded-lg border border-transparent px-2 py-1 font-display text-2xl font-bold hover:border-line focus:border-ink-2 ${isDone ? "text-muted line-through" : ""}`}
            />

            <section aria-labelledby="task-desc" className="flex flex-col gap-1">
              <h3 id="task-desc" className="px-2 text-sm font-semibold">
                Description
              </h3>
              <textarea
                aria-labelledby="task-desc"
                rows={4}
                value={description}
                readOnly={!canEdit}
                placeholder={canEdit ? "What needs doing, links, specs…" : "No description."}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== task.description && save({ description })}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed"
              />
            </section>

            <section aria-labelledby="task-checklist" className="flex flex-col gap-1.5">
              <h3 id="task-checklist" className="flex items-center gap-2 px-2 text-sm font-semibold">
                Checklist
                {checklist.length > 0 && (
                  <span className="font-normal text-muted">
                    {checked} of {checklist.length}
                  </span>
                )}
              </h3>
              {checklist.length > 0 && (
                <div className="mx-2 h-1.5 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                  <div className="h-full rounded-full bg-success" style={{ width: `${(checked / checklist.length) * 100}%` }} />
                </div>
              )}
              <ul className="flex flex-col">
                {checklist.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canEdit}
                      aria-label={item.text}
                      onChange={(e) => setList(checklist.map((c) => (c.id === item.id ? { ...c, done: e.target.checked } : c)))}
                      className="size-4"
                    />
                    <span className={`flex-1 text-sm ${item.done ? "text-muted line-through" : ""}`}>{item.text}</span>
                    {canEdit && (
                      <button type="button" aria-label={`Remove ${item.text}`} onClick={() => setList(checklist.filter((c) => c.id !== item.id))} className="text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100">
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && checklist.length < 50 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = newItem.trim();
                    if (!text) return;
                    setNewItem("");
                    setList([...checklist, { id: newId(), text, done: false }]);
                  }}
                  className="px-2"
                >
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="+ Add an item" aria-label="Add a checklist item" className="h-8 w-full rounded-lg border border-transparent px-2 text-sm hover:border-line focus:border-ink-2" />
                </form>
              )}
            </section>

            <section aria-labelledby="task-comments" className="flex flex-col gap-2">
              <h3 id="task-comments" className="px-2 text-sm font-semibold">
                Comments <span className="font-normal text-muted">· your team only</span>
              </h3>
              <ol className="flex flex-col gap-2">
                {detail.comments.length === 0 && <li className="px-2 text-sm text-muted">No comments yet. Type @ and a name to bring someone in.</li>}
                {detail.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5 rounded-lg bg-subtle p-3 text-sm">
                    <Avatar name={c.authorName} size={26} />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {c.authorName} <span className="font-normal text-muted">· {formatDateTime(c.createdAt, timeZone)}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-line">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {canEdit && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = draft.trim();
                    if (!body) return;
                    startSend(async () => {
                      const r = await comment(body);
                      if (r.ok) setDraft("");
                      setStatus(r.ok ? "Comment added" : r.error);
                    });
                  }}
                  className="flex gap-2"
                >
                  <label htmlFor="task-comment" className="sr-only">
                    Comment on this task
                  </label>
                  <input id="task-comment" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment… @name to mention" className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm" />
                  <button type="submit" disabled={sending || !draft.trim()} className={buttonClass("primary")}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </form>
              )}
            </section>
          </div>

          <aside aria-label="Task details" className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Status</span>
              <select value={task.statusId ?? ""} disabled={!canEdit} onChange={(e) => save({ statusId: e.target.value })} className={field}>
                {!task.statusId && <option value="">No status</option>}
                {detail.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Assignee</span>
              <select value={task.assigneeId ?? ""} disabled={!canEdit} onChange={(e) => save({ assigneeId: e.target.value || null })} className={field}>
                <option value="">Unassigned</option>
                {detail.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Due</span>
              <input
                type="datetime-local"
                defaultValue={localInput(task.dueAt, timeZone)}
                disabled={!canEdit}
                onBlur={(e) => e.target.value !== localInput(task.dueAt, timeZone) && save({ due: e.target.value })}
                className={field}
              />
              <span className="flex items-center gap-2">
                <DueChip iso={task.dueAt} done={isDone} timeZone={timeZone} now={now} />
                {task.dueAt && canEdit && (
                  <button type="button" onClick={() => save({ due: "" })} className="text-xs text-muted hover:text-ink">
                    Clear
                  </button>
                )}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Priority</span>
              <select value={task.priority} disabled={!canEdit} onChange={(e) => save({ priority: e.target.value })} className={field}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {detail.post?.scheduledAt && (
              <p className="text-xs text-muted">The post goes out {formatDateTime(detail.post.scheduledAt, timeZone)}.</p>
            )}
            <p className="mt-2 border-t border-line-soft pt-3 text-xs text-muted">
              {detail.createdByName ? `Created by ${detail.createdByName}, ` : "Created "}
              {formatDateTime(task.createdAt, timeZone)}
            </p>
            {canEdit &&
              (confirmDelete ? (
                <div className="flex flex-col gap-2 rounded-lg bg-danger-bg p-2 text-xs text-danger">
                  Delete this task and its comments?
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        start(async () => {
                          const r = await remove();
                          if (r.ok) close();
                          else setStatus(r.error);
                        })
                      }
                      className="rounded-md bg-danger px-2 py-1 font-semibold text-white"
                    >
                      Delete task
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 py-1 font-semibold">
                      Keep it
                    </button>
                  </span>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="self-start text-xs font-semibold text-muted hover:text-danger">
                  Delete task
                </button>
              ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
