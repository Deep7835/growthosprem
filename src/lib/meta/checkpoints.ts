// When to take a post's metrics snapshot (PRD 9): 1 hour, 24 hours, 3, 7 and 30 days
// after publishing, then frozen.
const HOUR = 36e5;
export const CHECKPOINTS_MS = [HOUR, 24 * HOUR, 72 * HOUR, 168 * HOUR, 720 * HOUR];
export const FROZEN_AFTER_MS = CHECKPOINTS_MS[CHECKPOINTS_MS.length - 1];

/** True if the post passed a checkpoint since its last snapshot (or has none yet). */
export function snapshotDue(publishedAt: Date, lastTakenAt: Date | null, now: Date): boolean {
  if (!lastTakenAt) return true;
  const published = publishedAt.getTime();
  if (lastTakenAt.getTime() >= published + FROZEN_AFTER_MS) return false;
  return CHECKPOINTS_MS.some((c) => published + c <= now.getTime() && lastTakenAt.getTime() < published + c);
}
