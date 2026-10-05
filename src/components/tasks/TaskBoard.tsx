"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Avatar, StatusDot } from "@/components/ui";
import type { TaskList, TaskRow } from "@/server/tasks";
import type { TaskResult } from "@/app/o/[org]/s/[space]/task-actions";
import { DueChip, PriorityTag } from "./bits";

/** VW-01 with the Tasks toggle: a column per task status; dragging a card changes its status. */
export function TaskBoard({
  data,
  timeZone,
  now,
  hrefFor,
  canEdit,
  move,
  create,
}: {
  data: TaskList;
  timeZone: string;
  now: number;
  /** The link that opens a task, keeping the current view. */
  hrefFor: string;
  canEdit: boolean;
  move: (id: string, change: { statusId: string }) => Promise<TaskResult>;
  create: (input: { title: string; statusId: string }) => Promise<TaskResult<{ id: string }>>;
}) {
  const [tasks, apply] = useOptimistic(data.tasks, (list: TaskRow[], m: { id: string; statusId: string }) => list.map((t) => (t.id === m.id ? { ...t, statusId: m.statusId } : t)));
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = (id: string | null) => data.members.find((m) => m.id === id)?.name ?? null;

  const drop = (statusId: string, id: string) => {
    setOver(null);
    start(async () => {
      apply({ id, statusId });
      const r = await move(id, { statusId });
      setError(r.ok ? null : r.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {data.statuses.map((status) => {
          const column = tasks.filter((t) => t.statusId === status.id);
          return (
            <section
              key={status.id}
              aria-label={status.name}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(status.id);
              }}
              onDragLeave={() => setOver((s) => (s === status.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/task-id");
                if (id) drop(status.id, id);
              }}
              className={`flex w-[272px] shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors ${over === status.id ? "bg-line" : "bg-line-soft"}`}
            >
              <header className="flex items-center gap-2 px-1.5 py-1 text-sm font-semibold">
                <StatusDot color={status.color} />
                {status.name}
                <span className="font-normal text-muted">{column.length}</span>
              </header>
              {column.map((t) => {
                const who = name(t.assigneeId);
                return (
                  <Link
                    key={t.id}
                    href={`${hrefFor}${hrefFor.includes("?") ? "&" : "?"}task=${t.id}`}
                    scroll={false}
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                    className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(23,24,28,0.05)] hover:border-ink-2/40"
                  >
                    <span className={`text-[15px] font-semibold leading-snug ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
                    <span className="truncate text-[13px] text-muted">{t.parent.kind === "space" ? "Space task" : t.parent.title}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <DueChip iso={t.dueAt} done={t.done} timeZone={timeZone} now={now} />
                      <PriorityTag priority={t.priority} />
                    </span>
                    <span className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="flex gap-2">
                        {t.checklistTotal > 0 && (
                          <span>
                            {t.checklistDone}/{t.checklistTotal} done
                          </span>
                        )}
                        {t.comments > 0 && <span>{t.comments === 1 ? "1 comment" : `${t.comments} comments`}</span>}
                      </span>
                      {who ? <Avatar name={who} size={22} /> : <span>Unassigned</span>}
                    </span>
                  </Link>
                );
              })}
              {canEdit &&
                (adding === status.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = title.trim();
                      if (!text) return;
                      setTitle("");
                      start(async () => {
                        const r = await create({ title: text, statusId: status.id });
                        setError(r.ok ? null : r.error);
                      });
                    }}
                  >
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => !title.trim() && setAdding(null)}
                      onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                      placeholder="Task title, then Enter"
                      aria-label={`New task in ${status.name}`}
                      className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm"
                    />
                  </form>
                ) : (
                  <button type="button" onClick={() => setAdding(status.id)} className="rounded-lg px-2 py-2 text-left text-sm text-muted hover:bg-surface hover:text-ink">
                    + New task
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
