"use server";

import { and, eq, inArray, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { spaces, statuses } from "@/db/schema";
import { requireSpaceAction } from "@/server/tenancy";

export async function saveAutopost(org: string, space: string, _state: { saved?: boolean; error?: string }, form: FormData) {
  const ctx = await requireSpaceAction(org, space, "space.settings");
  const eligible = z.array(z.uuid()).parse(form.getAll("eligible"));
  await withOrg(ctx.org.id, async (tx) => {
    await tx
      .update(spaces)
      .set({
        autopostNewContent: form.get("autopostNewContent") === "on",
        requireClientApproval: form.get("requireClientApproval") === "on",
        editorsCanSchedule: form.get("editorsCanSchedule") === "on",
      })
      .where(eq(spaces.id, ctx.space.id));
    if (eligible.length) {
      await tx.update(statuses).set({ autopostEligible: true }).where(and(eq(statuses.spaceId, ctx.space.id), inArray(statuses.id, eligible)));
    }
    await tx
      .update(statuses)
      .set({ autopostEligible: false })
      .where(and(eq(statuses.spaceId, ctx.space.id), eligible.length ? not(inArray(statuses.id, eligible)) : undefined));
  });
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  return { saved: true };
}
