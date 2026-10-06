// Inbox (beta): comments on the space's posts, brought in with each account sync and answered from
// Plotline. Shared by the job worker and the web server, so no Next.js imports.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Tx } from "@/db/core";
import { inboxMessages, inboxThreads, posts } from "@/db/schema";
import { sampleComments } from "@/lib/meta/fake";
import type { ImportedComment } from "@/lib/meta/graph";

export interface InboxAccount {
  id: string | null;
  orgId: string;
  spaceId: string;
  platform: "instagram" | "facebook";
  /** The account's own handle and name: their replies count as "out". */
  handle: string | null;
  name: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/^@/, "").trim().toLowerCase();

/** Saves a post's comments as threads. New comments from other people make a thread unread and reopen it. */
export async function storeComments(tx: Tx, account: InboxAccount, postId: string | null, comments: ImportedComment[], opts: { sample?: boolean } = {}) {
  const ours = new Set([norm(account.handle), norm(account.name), "you"].filter(Boolean));
  let fresh = 0;
  for (const c of comments) {
    if (ours.has(norm(c.author))) continue;
    const last = [c.at, ...c.replies.map((r) => r.at)].reduce((a, b) => (a > b ? a : b));
    const [existing] = await tx
      .select({ id: inboxThreads.id })
      .from(inboxThreads)
      .where(and(eq(inboxThreads.spaceId, account.spaceId), eq(inboxThreads.platform, account.platform), eq(inboxThreads.externalId, c.externalId)));
    const [thread] = await tx
      .insert(inboxThreads)
      .values({ orgId: account.orgId, spaceId: account.spaceId, socialAccountId: account.id, platform: account.platform, kind: "comment", externalId: c.externalId, postId, participant: c.author, preview: c.text.slice(0, 200), lastAt: last, sample: opts.sample ?? false })
      .onConflictDoUpdate({ target: [inboxThreads.spaceId, inboxThreads.platform, inboxThreads.externalId], set: { postId } })
      .returning();
    const rows = [
      { externalId: c.externalId, direction: "in" as const, author: c.author, body: c.text, sentAt: c.at },
      ...c.replies.map((r) => ({ externalId: r.externalId, direction: ours.has(norm(r.author)) ? ("out" as const) : ("in" as const), author: r.author, body: r.text, sentAt: r.at })),
    ];
    const added = await tx
      .insert(inboxMessages)
      .values(rows.map((r) => ({ orgId: account.orgId, threadId: thread.id, ...r })))
      .onConflictDoNothing()
      .returning({ direction: inboxMessages.direction, sentAt: inboxMessages.sentAt, body: inboxMessages.body });
    const inbound = added.filter((a) => a.direction === "in");
    if (added.length) {
      const newest = added.reduce((a, b) => (a.sentAt > b.sentAt ? a : b));
      await tx
        .update(inboxThreads)
        .set({
          lastAt: newest.sentAt > thread.lastAt ? newest.sentAt : thread.lastAt,
          preview: newest.body.slice(0, 200),
          // A new thread starts unread; an old one comes back when someone else writes again.
          ...(existing && inbound.length ? { unread: true, done: false } : {}),
        })
        .where(eq(inboxThreads.id, thread.id));
    }
    fresh += inbound.length;
  }
  return fresh;
}

/** Sample mode: comments on the space's recent imported posts, to try the Inbox without Meta. */
export async function addSampleConversations(tx: Tx, orgId: string, spaceId: string, now = new Date()) {
  const recent = await tx
    .select({ id: posts.id, externalId: posts.externalId, platform: posts.socialAccountId })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), gte(posts.publishedAt, new Date(now.getTime() - 60 * 864e5))))
    .orderBy(desc(posts.publishedAt))
    .limit(6);
  let added = 0;
  for (const [i, p] of recent.entries()) {
    const platform = i % 3 === 2 ? "facebook" : "instagram";
    added += await storeComments(tx, { id: null, orgId, spaceId, platform, handle: null, name: null }, p.id, sampleComments(`sample-${p.externalId}`, platform, now), { sample: true });
  }
  return added;
}

/** How many open, unread threads a space has (for the tab badge). */
export async function unreadCount(tx: Tx, spaceIds: string[]) {
  if (!spaceIds.length) return 0;
  const rows = await tx.select({ id: inboxThreads.id }).from(inboxThreads).where(and(inArray(inboxThreads.spaceId, spaceIds), eq(inboxThreads.unread, true), eq(inboxThreads.done, false)));
  return rows.length;
}
