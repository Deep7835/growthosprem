"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { notifications } from "@/db/schema";
import { getOrgContext } from "@/server/tenancy";

/** Marks one notification, or all of the person's, as read. */
export async function markRead(org: string, id?: string) {
  const ctx = await getOrgContext(org);
  await withOrg(ctx.org.id, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt), id ? eq(notifications.id, z.uuid().parse(id)) : undefined)),
  );
  revalidatePath(`/o/${org}`, "layout");
}
