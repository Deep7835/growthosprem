"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addToSpace, removeFromSpace } from "@/server/spaces";
import { requireSpaceAction } from "@/server/tenancy";

// Adding people to a space and taking them out: Owners, Admins and the space's Managers (PRD 4).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function addMembers(org: string, space: string, userIds: string[]): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "members.invite");
    await addToSpace(ctx, z.array(z.uuid()).min(1).max(100).parse(userIds));
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t add them." };
  }
}

export async function removeMember(org: string, space: string, userId: string): Promise<Result<{ tasks: number; posts: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "members.invite");
    if (userId === ctx.user.id && ctx.role === "manager") throw new Error("Ask an Admin to take you out of a space.");
    const r = await removeFromSpace(ctx, z.uuid().parse(userId));
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t remove them." };
  }
}
