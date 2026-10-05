"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addStatus, deleteStatus, importStatuses, moveStatus, updateStatus } from "@/server/statuses";
import { requireSpaceAction } from "@/server/tenancy";

// Statuses are space settings: Owners, Admins and the space's Managers (PRD 4).

export type StatusResult = { ok: true } | { ok: false; error: string };

const appliesTo = z.enum(["content", "task"]);
const category = z.enum(["not_started", "active", "completed", "closed"]);

async function run(org: string, space: string, fn: (ctx: Awaited<ReturnType<typeof requireSpaceAction>>) => Promise<unknown>): Promise<StatusResult> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    await fn(ctx);
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something in that change isn’t valid." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save. Try again." };
  }
}

export async function createStatus(org: string, space: string, kind: string, input: { name: string; color: string; category: string }) {
  return run(org, space, (ctx) => addStatus(ctx, appliesTo.parse(kind), { name: z.string().max(40).parse(input.name), color: z.string().max(7).parse(input.color), category: category.parse(input.category) }));
}

export async function changeStatus(
  org: string,
  space: string,
  id: string,
  patch: { name?: string; color?: string; category?: string; reviewRole?: string | null; autopostEligible?: boolean },
) {
  return run(org, space, (ctx) =>
    updateStatus(ctx, z.uuid().parse(id), {
      name: patch.name === undefined ? undefined : z.string().max(40).parse(patch.name),
      color: patch.color === undefined ? undefined : z.string().max(7).parse(patch.color),
      category: patch.category === undefined ? undefined : category.parse(patch.category),
      reviewRole: patch.reviewRole === undefined ? undefined : z.enum(["in_review", "approved", "changes_requested"]).nullable().parse(patch.reviewRole),
      autopostEligible: patch.autopostEligible === undefined ? undefined : z.boolean().parse(patch.autopostEligible),
    }),
  );
}

export async function reorderStatus(org: string, space: string, id: string, direction: number) {
  return run(org, space, (ctx) => moveStatus(ctx, z.uuid().parse(id), direction < 0 ? -1 : 1));
}

export async function removeStatus(org: string, space: string, id: string, replacementId: string | null) {
  return run(org, space, (ctx) => deleteStatus(ctx, z.uuid().parse(id), replacementId ? z.uuid().parse(replacementId) : null));
}

export async function importStatusSet(org: string, space: string, kind: string, from: string) {
  return run(org, space, (ctx) => {
    const [type, value] = z.string().max(60).parse(from).split(":");
    if (type === "space") return importStatuses(ctx, appliesTo.parse(kind), { spaceId: z.uuid().parse(value) });
    return importStatuses(ctx, appliesTo.parse(kind), { template: z.enum(["default", "agency", "simple", "tasks"]).parse(value) });
  });
}
