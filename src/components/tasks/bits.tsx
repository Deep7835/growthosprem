"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { dueState, formatDue, PRIORITIES, type Priority } from "@/lib/tasks";

/** Due date with Overdue, Today or Tomorrow called out (TK-03). */
export function DueChip({ iso, done, timeZone, now }: { iso: string | null; done: boolean; timeZone: string; now: number }) {
  if (!iso) return null;
  const state = dueState(new Date(iso), done, new Date(now), timeZone);
  const tone = state === "overdue" ? "bg-danger-bg text-danger" : state === "today" || state === "tomorrow" ? "bg-warn-bg text-warn-ink" : "text-muted";
  const label = state === "overdue" ? "Overdue · " : state === "today" ? "Today · " : state === "tomorrow" ? "Tomorrow · " : "";
  return (
    <span className={`inline-flex items-center rounded px-1.5 text-xs ${tone}`} title={formatDue(iso, timeZone)}>
      {label}
      {formatDue(iso, timeZone)}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  if (priority === "medium") return null;
  const p = PRIORITIES.find((x) => x.id === priority)!;
  return <span className={`text-xs font-semibold ${p.tone}`}>{p.label}</span>;
}

/** Content | Tasks on the Board and Table (VW-01, TK-02). */
export function ViewToggle({ current }: { current: "content" | "tasks" }) {
  const params = useSearchParams();
  const hrefFor = (view: "content" | "tasks") => {
    const next = new URLSearchParams(params.toString());
    next.delete("content");
    next.delete("task");
    if (view === "tasks") next.set("view", "tasks");
    else next.delete("view");
    const s = next.toString();
    return s ? `?${s}` : "?";
  };
  return (
    <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm font-semibold">
      {(["content", "tasks"] as const).map((v) => (
        <Link
          key={v}
          href={hrefFor(v)}
          scroll={false}
          aria-current={current === v ? "page" : undefined}
          className={`rounded-md px-3 py-1 ${current === v ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {v === "content" ? "Content" : "Tasks"}
        </Link>
      ))}
    </div>
  );
}
