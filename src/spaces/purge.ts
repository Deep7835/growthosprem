// SP-06: spaces deleted more than 30 days ago are removed for good, with their files. Run by the
// worker every minute; the database cascades remove everything inside the space.
import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db/core";
import { spaces } from "@/db/schema";
import { getStorage } from "@/storage";

export const PURGE_AFTER_MS = 30 * 864e5;

export async function purgeDeletedSpaces(db: Db, now = new Date()) {
  const due = await db
    .select({ id: spaces.id, orgId: spaces.orgId })
    .from(spaces)
    .where(and(isNotNull(spaces.deletedAt), lt(spaces.deletedAt, new Date(now.getTime() - PURGE_AFTER_MS))));
  for (const sp of due) {
    await getStorage().deletePrefix(`${sp.orgId}/${sp.id}`);
    await db.delete(spaces).where(eq(spaces.id, sp.id));
  }
  return due.length;
}
