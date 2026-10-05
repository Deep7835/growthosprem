"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateSpace } from "@/server/spaces";
import { requireSpaceAction } from "@/server/tenancy";

const platform = z.enum(["instagram", "facebook", "linkedin"]);

/** SP-03: Managers and up. */
export async function saveSpace(
  org: string,
  space: string,
  patch: { name?: string; color?: string; timezone?: string; platformColors?: Record<string, string>; hiddenPlatforms?: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    await updateSpace(ctx, {
      name: patch.name === undefined ? undefined : z.string().max(60).parse(patch.name),
      color: patch.color === undefined ? undefined : z.string().max(7).parse(patch.color),
      timezone: patch.timezone === undefined ? undefined : z.string().max(64).parse(patch.timezone),
      platformColors: patch.platformColors === undefined ? undefined : z.record(platform, z.string().max(7)).parse(patch.platformColors),
      hiddenPlatforms: patch.hiddenPlatforms === undefined ? undefined : z.array(platform).max(3).parse(patch.hiddenPlatforms),
    });
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Something in that change isn’t valid." : e instanceof Error ? e.message : "Couldn’t save." };
  }
}
