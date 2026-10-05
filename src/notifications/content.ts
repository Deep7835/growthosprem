// Who hears about a post (NT-02: comments and mentions, content updates, client review):
// its assignees, its creator and the teammates who commented on it.
import { and, eq, isNotNull } from "drizzle-orm";
import type { Tx } from "@/db/core";
import { comments, contentAssignees, contentItems, organizations, spaces } from "@/db/schema";

export async function postFollowers(tx: Tx, contentItemId: string): Promise<string[]> {
  const [assigned, [item], commenters] = await Promise.all([
    tx.select({ id: contentAssignees.userId }).from(contentAssignees).where(eq(contentAssignees.contentItemId, contentItemId)),
    tx.select({ createdBy: contentItems.createdBy }).from(contentItems).where(eq(contentItems.id, contentItemId)),
    tx
      .select({ id: comments.authorUserId })
      .from(comments)
      .where(and(eq(comments.contentItemId, contentItemId), isNotNull(comments.authorUserId))),
  ]);
  return [...new Set([...assigned.map((a) => a.id), ...(item?.createdBy ? [item.createdBy] : []), ...commenters.map((c) => c.id!)])];
}

export async function assigneesOf(tx: Tx, contentItemId: string): Promise<string[]> {
  return (await tx.select({ id: contentAssignees.userId }).from(contentAssignees).where(eq(contentAssignees.contentItemId, contentItemId))).map((a) => a.id);
}

/** The link that opens a post's panel. */
export async function postHref(tx: Tx, item: { id: string; spaceId: string; orgId: string }): Promise<string> {
  const [row] = await tx
    .select({ org: organizations.slug, space: spaces.slug })
    .from(spaces)
    .innerJoin(organizations, eq(organizations.id, spaces.orgId))
    .where(eq(spaces.id, item.spaceId));
  return row ? `/o/${row.org}/s/${row.space}/board?content=${item.id}` : "";
}

/**
 * People @mentioned in a plain-text comment: "@Priya" or "@Priya Sharma" for anyone in the
 * space. A full name wins over a first name both people share.
 */
export function mentionedIn(body: string, people: { id: string; name: string }[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  const firstNames = new Map<string, string[]>();
  for (const p of people) {
    const first = p.name.split(/\s+/)[0].toLowerCase();
    firstNames.set(first, [...(firstNames.get(first) ?? []), p.id]);
  }
  const at = (needle: string) => {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u");
    return re.test(text);
  };
  for (const p of people) {
    if (at(p.name.toLowerCase())) found.add(p.id);
  }
  for (const [first, ids] of firstNames) {
    if (ids.length === 1 && at(first)) found.add(ids[0]);
  }
  return [...found];
}
