"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createProject, deletePreview, deleteProject, duplicateProject, setArchived, updateProject } from "@/server/projects";
import { requireSpaceAction } from "@/server/tenancy";

// Projects are managed in Space settings: Owners, Admins and the space's Managers.

export type ProjectResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const input = z.object({
  name: z.string().max(80),
  goal: z.string().max(300).nullable().optional(),
  startsOn: z.string().max(10).nullable().optional(),
  endsOn: z.string().max(10).nullable().optional(),
  color: z.string().max(7).nullable().optional(),
});

async function run<T extends object>(org: string, space: string, fn: (ctx: Awaited<ReturnType<typeof requireSpaceAction>>) => Promise<T>): Promise<ProjectResult<T>> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    const out = await fn(ctx);
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something in that form isn’t valid." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save. Try again." };
  }
}

export async function addProject(org: string, space: string, values: unknown, withFolder: boolean): Promise<ProjectResult<{ id: string; href: string }>> {
  return run(org, space, async (ctx) => {
    const p = await createProject(ctx, input.parse(values), z.boolean().parse(withFolder));
    return { id: p.id, href: `/o/${org}/s/${space}/p/${p.id}/board` };
  });
}

export async function editProject(org: string, space: string, id: string, values: unknown): Promise<ProjectResult> {
  return run(org, space, async (ctx) => {
    await updateProject(ctx, z.uuid().parse(id), input.parse(values));
    return {};
  });
}

export async function copyProject(org: string, space: string, id: string): Promise<ProjectResult<{ id: string }>> {
  return run(org, space, async (ctx) => ({ id: (await duplicateProject(ctx, z.uuid().parse(id))).id }));
}

export async function archiveProject(org: string, space: string, id: string, archived: boolean): Promise<ProjectResult> {
  return run(org, space, async (ctx) => {
    await setArchived(ctx, z.uuid().parse(id), z.boolean().parse(archived));
    return {};
  });
}

export async function previewDelete(org: string, space: string, id: string): Promise<ProjectResult<{ usedElsewhere: string[] }>> {
  return run(org, space, async (ctx) => deletePreview(ctx, z.uuid().parse(id)));
}

export async function removeProject(
  org: string,
  space: string,
  id: string,
  typedName: string,
  also: { content: boolean; tasks: boolean; notes: boolean; media: boolean },
): Promise<ProjectResult> {
  return run(org, space, async (ctx) => {
    const flags = z.object({ content: z.boolean(), tasks: z.boolean(), notes: z.boolean(), media: z.boolean() }).parse(also);
    await deleteProject(ctx, z.uuid().parse(id), z.string().max(80).parse(typedName), flags);
    return {};
  });
}
