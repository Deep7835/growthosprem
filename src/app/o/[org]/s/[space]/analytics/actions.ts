"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withOrg } from "@/db";
import { spaces } from "@/db/schema";
import { REFRESH_INTERVAL_MS } from "@/server/analytics";
import { requireSpaceAction } from "@/server/tenancy";

/**
 * Manual refresh, at most once every 15 minutes per space (AN-10). Queuing the
 * metrics sync job is added with the Instagram and Facebook connection; until
 * then this records the refresh and recomputes the page.
 */
export async function refreshAnalytics(org: string, space: string): Promise<{ error?: string }> {
  const ctx = await requireSpaceAction(org, space, "analytics.view");
  const last = ctx.space.metricsRefreshedAt?.getTime() ?? 0;
  const wait = last + REFRESH_INTERVAL_MS - Date.now();
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60000);
    return { error: `Analytics were refreshed recently. You can refresh again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }
  await withOrg(ctx.org.id, (tx) => tx.update(spaces).set({ metricsRefreshedAt: new Date() }).where(eq(spaces.id, ctx.space.id)));
  revalidatePath(`/o/${org}/s/${space}/analytics`);
  return {};
}
