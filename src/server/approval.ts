import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { contentItems, statuses } from "@/db/schema";
import { logActivity } from "./activity";

/**
 * Changing approved content (caption, title, hashtags, media) clears the approval and
 * sends the post back to review (SH-07).
 */
export async function returnToReviewIfApproved(tx: Tx, item: { id: string; orgId: string; spaceId: string; statusId: string }) {
  const [current] = await tx.select().from(statuses).where(eq(statuses.id, item.statusId));
  if (current?.reviewRole !== "approved") return;
  const [review] = await tx
    .select()
    .from(statuses)
    .where(and(eq(statuses.spaceId, item.spaceId), eq(statuses.reviewRole, "in_review")));
  if (!review) return;
  await tx.update(contentItems).set({ statusId: review.id }).where(eq(contentItems.id, item.id));
  await logActivity(tx, {
    orgId: item.orgId,
    spaceId: item.spaceId,
    contentItemId: item.id,
    actor: { kind: "system" },
    action: "approval cleared",
    field: "status",
    before: current.name,
    after: review.name,
  });
}
