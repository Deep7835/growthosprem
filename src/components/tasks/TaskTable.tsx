"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { localInput, PRIORITIES, priorityRank } from "@/lib/tasks";
import type { TaskList, TaskRow } from "@/server/tasks";
import type { TaskResult } from "@/app/o/[org]/s/[space]/task-actions";
import { DueChip } from "./bits";

type Edit = { statusId?: string; done?: boolean; assigneeId?: string | null; due?: string; priority?: string };
type Sort = "due" | "priority" | "updated" | "title";

/** VW-03 with the Tasks toggle: inline editing, filters and sort for the space's tasks. */
export function TaskTable({
  data,
  me,
  timeZone,
  now,
  hrefFor,
  canEdit,
  edit,
  create,
}: {
  data: TaskList;
  me: string;
  timeZone: string;
  now: number;
  hrefFor: string;
  canEdit: boolean;
  edit: (id: string, change: Edit) => Promise<TaskResult>;
  create: (input: { title: string }) => Promise<TaskResult<{ id: string }>>;
}) {
  const [rows, apply] = useOptimistic(data.tasks, (list: TaskRow[], c: { id: string; patch: Partial<TaskRow> }) => list.map((t) => (t.id === c.id ? { ...t, ...c.patch } : t)));
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [statusId, setStatusId] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [sort, setSort] = useState<Sort>("due");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const doneIds = new Set(data.statuses.filter((s) => s.category === "completed" || s.category === "closed").map((s) => s.id));

  const shown = useMemo(() => {
    const weekEnd = now + 7 * 864e5;
    const text = q.trim().toLowerCase();
    const list = rows.filter((t) => {
      if (!showDone && t.done && !statusId) return false;
      if (text && !`${t.title} ${t.parent.title}`.toLowerCase().includes(text)) return false;
      if (who === "me" && t.assigneeId !== me) return false;
      if (who === "none" && t.assigneeId) return false;
      if (who && who !== "me" && who !== "none" && t.assigneeId !== who) return false;
      if (statusId && t.statusId !== statusId) return false;
      const at = t.dueAt ? new Date(t.dueAt).getTime() : null;
      if (due === "overdue" && !(at !== null && at < now && !t.done)) return false;
      if (due === "week" && !(at !== null && at >= now && at <= weekEnd)) return false;
      if (due === "none" && at !== null) return false;
      return true;
    });
    const byDue = (a: TaskRow, b: TaskRow) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
    return [...list].sort((a, b) =>
      sort === "due" ? byDue(a, b) : sort === "priority" ? priorityRank(a.priority) - priorityRank(b.priority) || byDue(a, b) : sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : a.title.localeCompare(b.title),
    );
  }, [rows, q, who, statusId, due, showDone, sort, me, now]);

  const change = (t: TaskRow, c: Edit, patch: Partial<TaskRow>) =>
    start(async () => {
      apply({ id: t.id, patch });
      const r = await edit(t.id, c);
      setError(r.ok ? null : r.error);
    });

  const control = "h-8 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-line focus:border-ink-2 disabled:hover:border-transparent";
  const filter = "h-9 rounded-lg border border-line bg-surface px-2 text-sm";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className={`${filter} min-w-[180px] flex-1`} />
        <select aria-label="Assignee" value={who} onChange={(e) => setWho(e.target.value)} className={filter}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {data.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={statusId} onChange={(e) => setStatusId(e.target.value)} className={filter}>
          <option value="">Any status</option>
          {data.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} className={filter}>
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Next 7 days</option>
          <option value="none">No due date</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={filter}>
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="updated">Sort: Last updated</option>
          <option value="title">Sort: Title</option>
        </select>
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="w-10 px-3 py-2.5">
                <span className="sr-only">Done</span>
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Task
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Status
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Assignee
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Due
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Priority
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {canEdit && (
              <tr>
                <td />
                <td colSpan={5} className="px-2 py-1.5">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = title.trim();
                      if (!text) return;
                      setTitle("");
                      start(async () => {
                        const r = await create({ title: text });
                        setError(r.ok ? null : r.error);
                      });
                    }}
                  >
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ New task (press Enter)" aria-label="New task" className="h-8 w-full rounded-md border border-transparent px-1.5 text-sm hover:border-line focus:border-ink-2" />
                  </form>
                </td>
              </tr>
            )}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  {rows.length === 0 ? "No tasks yet. Add one above, or add a template’s tasks from a post." : "No tasks match these filters."}
                </td>
              </tr>
            )}
            {shown.map((t) => (
              <tr key={t.id} className="hover:bg-subtle/60">
                <td className="px-3">
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={!canEdit}
                    aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}
                    onChange={(e) => {
                      const done = e.target.checked;
                      const next = data.statuses.find((s) => s.category === (done ? "completed" : "not_started"));
                      change(t, { done }, { done, statusId: next?.id ?? t.statusId });
                    }}
                    className="size-4"
                  />
                </td>
                <td className="max-w-[340px] px-2 py-1.5">
                  <Link href={`${hrefFor}${hrefFor.includes("?") ? "&" : "?"}task=${t.id}`} scroll={false} className={`block truncate font-semibold hover:underline ${t.done ? "text-muted line-through" : ""}`}>
                    {t.title}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {t.parent.kind === "space" ? "Space task" : t.parent.title}
                    {t.checklistTotal > 0 && ` · ${t.checklistDone}/${t.checklistTotal} done`}
                  </span>
                </td>
                <td className="px-2">
                  <select
                    aria-label={`Status of ${t.title}`}
                    value={t.statusId ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => change(t, { statusId: e.target.value }, { statusId: e.target.value, done: doneIds.has(e.target.value) })}
                    className={control}
                  >
                    {!t.statusId && <option value="">No status</option>}
                    {data.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2">
                  <select aria-label={`Assignee of ${t.title}`} value={t.assigneeId ?? ""} disabled={!canEdit} onChange={(e) => change(t, { assigneeId: e.target.value || null }, { assigneeId: e.target.value || null })} className={control}>
                    <option value="">Unassigned</option>
                    {data.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2">
                  {canEdit ? (
                    <span className="flex flex-col">
                      <input
                        key={`due-${t.dueAt}`}
                        type="datetime-local"
                        aria-label={`Due date of ${t.title}`}
                        defaultValue={localInput(t.dueAt, timeZone)}
                        onBlur={(e) => e.target.value !== localInput(t.dueAt, timeZone) && change(t, { due: e.target.value }, {})}
                        className={control}
                      />
                      {t.dueAt && !t.done && new Date(t.dueAt).getTime() < now && <span className="px-1.5 text-xs font-semibold text-danger">Overdue</span>}
                    </span>
                  ) : (
                    <DueChip iso={t.dueAt} done={t.done} timeZone={timeZone} now={now} />
                  )}
                </td>
                <td className="px-2">
                  <select aria-label={`Priority of ${t.title}`} value={t.priority} disabled={!canEdit} onChange={(e) => change(t, { priority: e.target.value }, { priority: e.target.value as TaskRow["priority"] })} className={control}>
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {shown.length} of {rows.length} task{rows.length === 1 ? "" : "s"}
        {!showDone && rows.some((t) => t.done) && " · done ones hidden"}
      </p>
    </div>
  );
}
