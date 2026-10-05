"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseLocal } from "@/server/publishing";
import { addTaskComment, applyTemplate, createTask, deleteTask, updateTask } from "@/server/tasks";
import { requireSpaceAction } from "@/server/tenancy";

// Tasks (PRD 6.8): anyone who can edit content in the space.

export type TaskResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const priority = z.enum(["low", "medium", "high", "urgent"]);
// "2026-10-12T18:00" in the space's time zone, or empty for no due date.
const localDue = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]);

async function run<T extends object>(org: string, space: string, fn: (ctx: Awaited<ReturnType<typeof requireSpaceAction>>) => Promise<T>): Promise<TaskResult<T>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const out = await fn(ctx);
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something in that change isn’t valid." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save. Try again." };
  }
}

type NewTaskInput = { title: string; contentItemId?: string | null; projectId?: string | null; statusId?: string | null; assigneeId?: string | null; due?: string; priority?: string };

export async function newTask(org: string, space: string, input: NewTaskInput): Promise<TaskResult<{ id: string }>> {
  return newTaskIn(org, space, null, input);
}

/** From a project's views (PJ-02) the task belongs to that project. */
export async function newTaskIn(org: string, space: string, projectId: string | null, input: NewTaskInput): Promise<TaskResult<{ id: string }>> {
  if (projectId && !input.contentItemId) input = { ...input, projectId };
  return run(org, space, async (ctx) => {
    const due = localDue.parse(input.due ?? "");
    const task = await createTask(ctx, {
      title: z.string().max(200).parse(input.title),
      contentItemId: input.contentItemId ? z.uuid().parse(input.contentItemId) : null,
      projectId: input.projectId ? z.uuid().parse(input.projectId) : null,
      statusId: input.statusId ? z.uuid().parse(input.statusId) : null,
      assigneeId: input.assigneeId ? z.uuid().parse(input.assigneeId) : null,
      dueAt: due ? parseLocal(due, ctx.space.timezone) : null,
      priority: input.priority ? priority.parse(input.priority) : undefined,
    });
    return { id: task.id };
  });
}

export async function editTask(
  org: string,
  space: string,
  id: string,
  change: { title?: string; description?: string; statusId?: string; done?: boolean; assigneeId?: string | null; due?: string; priority?: string; checklist?: unknown; position?: number },
): Promise<TaskResult> {
  return run(org, space, async (ctx) => {
    const due = change.due === undefined ? undefined : localDue.parse(change.due);
    await updateTask(ctx, z.uuid().parse(id), {
      title: change.title === undefined ? undefined : z.string().max(200).parse(change.title),
      description: change.description === undefined ? undefined : z.string().max(10_000).parse(change.description),
      statusId: change.statusId === undefined ? undefined : z.uuid().parse(change.statusId),
      done: change.done === undefined ? undefined : z.boolean().parse(change.done),
      assigneeId: change.assigneeId === undefined ? undefined : change.assigneeId ? z.uuid().parse(change.assigneeId) : null,
      dueAt: due === undefined ? undefined : due ? parseLocal(due, ctx.space.timezone) : null,
      priority: change.priority === undefined ? undefined : priority.parse(change.priority),
      checklist: change.checklist === undefined ? undefined : (z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).max(50).parse(change.checklist)),
      position: change.position === undefined ? undefined : z.number().finite().parse(change.position),
    });
    return {};
  });
}

export async function removeTask(org: string, space: string, id: string): Promise<TaskResult> {
  return run(org, space, async (ctx) => {
    await deleteTask(ctx, z.uuid().parse(id));
    return {};
  });
}

export async function commentOnTask(org: string, space: string, id: string, body: string): Promise<TaskResult> {
  return run(org, space, async (ctx) => {
    await addTaskComment(ctx, z.uuid().parse(id), z.string().max(5000).parse(body));
    return {};
  });
}

export async function addTemplateTasks(org: string, space: string, contentId: string, format?: string, assigneeId?: string | null): Promise<TaskResult<{ added: number }>> {
  return run(org, space, async (ctx) => {
    const r = await applyTemplate(
      ctx,
      z.uuid().parse(contentId),
      format ? z.enum(["reel", "carousel", "post", "story"]).parse(format) : undefined,
      assigneeId ? z.uuid().parse(assigneeId) : null,
    );
    return { added: r.added };
  });
}
