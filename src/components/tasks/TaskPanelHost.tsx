import { notFound } from "next/navigation";
import { commentOnTask, editTask, removeTask } from "@/app/o/[org]/s/[space]/task-actions";
import { getTask } from "@/server/tasks";
import type { SpaceContext } from "@/server/tenancy";
import { TaskPanel } from "./TaskPanel";

/** The task panel over any space view (?task=id), closing back to that view. */
export async function TaskPanelHost({ ctx, org, space, taskId, closeHref }: { ctx: SpaceContext; org: string; space: string; taskId: string | null; closeHref: string }) {
  if (!taskId) return null;
  if (!/^[0-9a-f-]{36}$/.test(taskId)) notFound();
  const detail = await getTask(ctx, taskId);
  if (!detail) notFound();
  return (
    <TaskPanel
      key={detail.task.id}
      detail={detail}
      timeZone={ctx.space.timezone}
      canEdit={ctx.can("content.edit")}
      closeHref={closeHref}
      postHref={detail.post ? `/o/${org}/s/${space}/board?content=${detail.post.id}` : null}
      now={ctx.requestTime}
      edit={editTask.bind(null, org, space, detail.task.id)}
      remove={removeTask.bind(null, org, space, detail.task.id)}
      comment={commentOnTask.bind(null, org, space, detail.task.id)}
    />
  );
}

/** Where closing the task goes: the same page and view, without ?task. */
export function withoutTask(path: string, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (k !== "task" && typeof v === "string") params.set(k, v);
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}
