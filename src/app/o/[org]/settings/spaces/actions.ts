"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSpace, deleteSpace, restoreDeletedSpace, setSpaceArchived } from "@/server/spaces";
import { getOrgContext } from "@/server/tenancy";

// Creating, archiving and deleting spaces: the Owner and Admins (PRD 4). Restoring a deleted space: the Owner.

export type SpaceResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(org: string, fn: (ctx: Awaited<ReturnType<typeof getOrgContext>>) => Promise<T>): Promise<SpaceResult<T>> {
  try {
    const ctx = await getOrgContext(org);
    const out = await fn(ctx);
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something in that form isn’t valid." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save. Try again." };
  }
}

const newSpace = z.object({
  name: z.string().max(60),
  color: z.string().max(7),
  timezone: z.string().max(64),
  memberIds: z.array(z.uuid()).max(200),
  statuses: z.union([z.object({ template: z.enum(["default", "agency", "simple"]) }), z.object({ copyFrom: z.uuid() })]),
});

export async function addSpace(org: string, input: unknown): Promise<SpaceResult<{ href: string }>> {
  return run(org, async (ctx) => {
    const space = await createSpace(ctx, newSpace.parse(input));
    return { href: `/o/${org}/s/${space.slug}/board` };
  });
}

export async function archiveSpace(org: string, spaceId: string, archived: boolean): Promise<SpaceResult<{ paused: number }>> {
  return run(org, async (ctx) => ({ paused: await setSpaceArchived(ctx, z.uuid().parse(spaceId), z.boolean().parse(archived)) }));
}

export async function removeSpace(org: string, spaceId: string, typedName: string): Promise<SpaceResult<{ paused: number }>> {
  return run(org, async (ctx) => ({ paused: await deleteSpace(ctx, z.uuid().parse(spaceId), z.string().max(60).parse(typedName)) }));
}

export async function restoreSpace(org: string, spaceId: string): Promise<SpaceResult> {
  return run(org, async (ctx) => {
    await restoreDeletedSpace(ctx, z.uuid().parse(spaceId));
    return {};
  });
}
