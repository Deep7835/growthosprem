// Safety net, run every minute by the worker: every scheduled placement that is due gets its
// publish job (or reminder), even if the job was lost; ones that missed their time by hours
// (the server was down) fail with a clear reason instead of posting at a surprising time.
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { withOrg, type Db } from "@/db/core";
import { contentItems, placements } from "@/db/schema";
import { enqueue, PRIORITY } from "@/jobs/queue";
import { PUBLISH_JOB, syncItemState } from "./run";

const MISSED_AFTER_MS = 6 * 3600_000;

export async function reconcileScheduled(db: Db, now = new Date()) {
  const due = await db
    .select({ placement: placements, item: contentItems })
    .from(placements)
    .innerJoin(contentItems, eq(contentItems.id, placements.contentItemId))
    .where(and(eq(placements.state, "scheduled"), isNotNull(contentItems.scheduledAt), lte(contentItems.scheduledAt, now)));

  const jobs = [];
  const missed = [];
  for (const { placement, item } of due) {
    const at = item.scheduledAt!;
    if (now.getTime() - at.getTime() > MISSED_AFTER_MS) {
      missed.push({ placement, item });
      continue;
    }
    jobs.push(
      item.autopost
        ? {
            kind: PUBLISH_JOB.publish,
            payload: { placementId: placement.id, scheduledAt: at.toISOString(), ...(placement.socialAccountId ? { accountId: placement.socialAccountId } : {}) },
            priority: PRIORITY.publish,
            dedupeKey: `publish:${placement.id}:${at.getTime()}`,
          }
        : {
            kind: PUBLISH_JOB.reminder,
            payload: { contentItemId: item.id, orgId: item.orgId, scheduledAt: at.toISOString() },
            priority: PRIORITY.publish,
            dedupeKey: `reminder:${item.id}:${at.getTime()}`,
          },
    );
  }
  if (jobs.length) await enqueue(db, jobs);

  for (const { placement, item } of missed) {
    await withOrg(db, item.orgId, async (tx) => {
      if (item.autopost) {
        await tx
          .update(placements)
          .set({ state: "failed", error: "Missed its scheduled time while publishing was offline. Retry to post it now, or reschedule.", errorRetryable: true, failedAt: now })
          .where(eq(placements.id, placement.id));
      } else {
        // A reminder that is hours late is no use; leave the post for someone to mark as posted.
        await tx.update(placements).set({ state: "draft" }).where(eq(placements.id, placement.id));
      }
      await syncItemState(tx, item.id);
    });
  }
  return { queued: jobs.length, missed: missed.length };
}
