"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { posts, spaces } from "@/db/schema";
import { HOOK_TYPES } from "@/lib/ai/tags";
import { REFRESH_INTERVAL_MS } from "@/server/analytics";
import { requestSync } from "@/server/meta";
import { requireSpaceAction } from "@/server/tenancy";

/** Manual refresh, at most once every 15 minutes per space (AN-10): queues a metrics sync. */
export async function refreshAnalytics(org: string, space: string): Promise<{ error?: string }> {
  const ctx = await requireSpaceAction(org, space, "analytics.view");
  const last = ctx.space.metricsRefreshedAt?.getTime() ?? 0;
  const wait = last + REFRESH_INTERVAL_MS - Date.now();
  if (wait > 0) {
    const minutes = Math.ceil(wait / 60000);
    return { error: `Analytics were refreshed recently. You can refresh again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }
  await withOrg(ctx.org.id, (tx) => tx.update(spaces).set({ metricsRefreshedAt: new Date() }).where(eq(spaces.id, ctx.space.id)));
  await requestSync(ctx);
  revalidatePath(`/o/${org}/s/${space}/analytics`);
  return {};
}

/** Corrects a post's AI tags. Hand-set tags are kept: AI never tags that post again. */
export async function setPostTags(org: string, space: string, postId: string, tags: { pillar: string; topic: string; hookType: string }): Promise<{ error?: string }> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const id = z.uuid().parse(postId);
    const clean = (v: string, max: number) => v.trim().slice(0, max) || null;
    const hook = z.enum(HOOK_TYPES).or(z.literal("")).parse(tags.hookType);
    const updated = await withOrg(ctx.org.id, (tx) =>
      tx
        .update(posts)
        .set({ pillar: clean(tags.pillar, 60), topic: clean(tags.topic, 80), hookType: hook && hook !== "None" ? hook : null, tagSource: "manual", taggedAt: new Date() })
        .where(and(eq(posts.id, id), eq(posts.spaceId, ctx.space.id)))
        .returning({ id: posts.id }),
    );
    if (!updated.length) return { error: "That post isn’t in this space." };
    revalidatePath(`/o/${org}/s/${space}/analytics`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn’t save the tags." };
  }
}
