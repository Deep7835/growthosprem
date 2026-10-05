"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Avatar, buttonClass } from "@/components/ui";
import type { TemplateFormat } from "@/lib/tasks";
import type { PostTasks as Data } from "@/server/tasks";
import type { TaskResult } from "@/app/o/[org]/s/[space]/task-actions";
import { DueChip } from "./bits";

type Row = Data["tasks"][number];

/** The post panel's Tasks (CT-04, TK-01, TK-04): tick off, add one, or add a format's steps. */
export function PostTasks({
  data,
  canEdit,
  timeZone,
  now,
  create,
  setDone,
  applyTemplate,
  contentId,
}: {
  data: Data;
  canEdit: boolean;
  timeZone: string;
  now: number;
  create: (input: { title: string; contentItemId: string }) => Promise<TaskResult<{ id: string }>>;
  setDone: (id: string, change: { done: boolean }) => Promise<TaskResult>;
  applyTemplate: (format?: string, assigneeId?: string | null) => Promise<TaskResult<{ added: number }>>;
  contentId: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [rows, apply] = useOptimistic(data.tasks, (list: Row[], c: { id: string; done: boolean }) => list.map((t) => (t.id === c.id ? { ...t, done: c.done } : t)));
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<TemplateFormat>(data.format);
  const [assignee, setAssignee] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const open = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("task", id);
    return `${pathname}?${next.toString()}`;
  };
  const template = data.templates.find((t) => t.id === format)!;
  const name = (id: string | null) => data.members.find((m) => m.id === id)?.name ?? null;

  return (
    <section aria-labelledby="post-tasks" className="flex flex-col gap-2 px-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="post-tasks" className="text-sm font-semibold">
          Tasks{" "}
          {rows.length > 0 && (
            <span className="font-normal text-muted">
              {rows.filter((t) => t.done).length} of {rows.length} done
            </span>
          )}
        </h3>
        {canEdit && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-muted hover:text-ink">
            + New task
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col">
          {rows.map((t) => {
            const who = name(t.assigneeId);
            return (
              <li key={t.id} className="flex items-center gap-2 rounded-lg py-1 pr-1 hover:bg-subtle">
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={!canEdit}
                  aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}
                  onChange={(e) => {
                    const done = e.target.checked;
                    start(async () => {
                      apply({ id: t.id, done });
                      const r = await setDone(t.id, { done });
                      setMessage(r.ok ? null : r.error);
                    });
                  }}
                  className="ml-1 size-4"
                />
                <Link href={open(t.id)} scroll={false} className={`min-w-0 flex-1 truncate text-sm hover:underline ${t.done ? "text-muted line-through" : ""}`}>
                  {t.title}
                </Link>
                {t.checklistTotal > 0 && (
                  <span className="text-xs text-muted">
                    {t.checklistDone}/{t.checklistTotal}
                  </span>
                )}
                <DueChip iso={t.dueAt} done={t.done} timeZone={timeZone} now={now} />
                {who && <Avatar name={who} size={22} />}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = title.trim();
            if (!text) return;
            setTitle("");
            start(async () => {
              const r = await create({ title: text, contentItemId: contentId });
              setMessage(r.ok ? null : r.error);
            });
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            placeholder="Task title, then Enter"
            aria-label="New task"
            className="h-9 w-full rounded-lg border border-line px-2 text-sm"
          />
        </form>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-2.5 py-2 text-[13px]">
          <span className="text-muted">Steps for a</span>
          <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as TemplateFormat)} className="h-7 rounded-md border border-line bg-surface px-1.5">
            {data.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select aria-label="Assign the steps to" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-7 rounded-md border border-line bg-surface px-1.5">
            <option value="">Unassigned</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || template.missing === 0}
            onClick={() =>
              start(async () => {
                const r = await applyTemplate(format, assignee || null);
                setMessage(r.ok ? `Added ${r.added} task${r.added === 1 ? "" : "s"}.` : r.error);
              })
            }
            className={buttonClass("secondary", "sm")}
          >
            {template.missing === 0 ? "All added" : `Add ${template.missing} task${template.missing === 1 ? "" : "s"}`}
          </button>
          <span className="w-full text-xs text-muted">{data.scheduled ? "Due dates count back from the publish date." : "Schedule the post first to get due dates."}</span>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      )}
    </section>
  );
}
