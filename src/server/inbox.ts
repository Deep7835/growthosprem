// Inbox (beta) for one space: list, read, mark done and reply to comments.
import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { withOrg } from "@/db";
import { inboxMessages, inboxThreads, posts, socialAccounts } from "@/db/schema";
import { addSampleConversations } from "@/inbox/core";
import { openToken } from "@/lib/crypto";
import { getGraph, metaMode } from "@/lib/meta";
import type { SpaceContext } from "@/server/tenancy";

export type InboxFilter = { kind: "all" | "comment" | "message"; status: "open" | "done"; q: string };

export async function listThreads(ctx: SpaceContext, f: InboxFilter) {
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  return withOrg(ctx.org.id, (tx) =>
    tx
      .select()
      .from(inboxThreads)
      .where(
        and(
          eq(inboxThreads.spaceId, ctx.space.id),
          eq(inboxThreads.done, f.status === "done"),
          f.kind === "all" ? undefined : eq(inboxThreads.kind, f.kind),
          like ? or(ilike(inboxThreads.participant, like), ilike(inboxThreads.preview, like)) : undefined,
        ),
      )
      .orderBy(desc(inboxThreads.lastAt))
      .limit(200),
  );
}

export async function getThread(ctx: SpaceContext, id: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [thread] = await tx.select().from(inboxThreads).where(and(eq(inboxThreads.id, id), eq(inboxThreads.spaceId, ctx.space.id)));
    if (!thread) return null;
    const [messages, [post]] = await Promise.all([
      tx.select().from(inboxMessages).where(eq(inboxMessages.threadId, id)).orderBy(asc(inboxMessages.sentAt)),
      thread.postId ? tx.select({ title: posts.title, permalink: posts.permalink, publishedAt: posts.publishedAt, format: posts.format }).from(posts).where(eq(posts.id, thread.postId)) : Promise.resolve([]),
    ]);
    if (thread.unread) await tx.update(inboxThreads).set({ unread: false }).where(eq(inboxThreads.id, id));
    return { thread, messages, post: post ?? null };
  });
}

export async function setDone(ctx: SpaceContext, id: string, done: boolean) {
  await withOrg(ctx.org.id, (tx) => tx.update(inboxThreads).set({ done, unread: false }).where(and(eq(inboxThreads.id, id), eq(inboxThreads.spaceId, ctx.space.id))));
}

/**
 * Replies publicly under the comment, as the connected account. Sample threads keep the reply in
 * Plotline only (nothing is sent anywhere).
 */
export async function reply(ctx: SpaceContext, id: string, body: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const [thread] = await tx.select().from(inboxThreads).where(and(eq(inboxThreads.id, id), eq(inboxThreads.spaceId, ctx.space.id)));
    if (!thread) throw new Error("That conversation isn’t here any more.");
    let externalId: string | null = null;
    let author = ctx.space.name;
    if (!thread.sample) {
      if (!thread.socialAccountId) throw new Error("This conversation isn’t linked to a connected account.");
      const [account] = await tx.select().from(socialAccounts).where(eq(socialAccounts.id, thread.socialAccountId));
      if (!account?.accessTokenEnc || account.status === "disconnected" || account.status === "reconnect_needed") throw new Error("Reconnect the account in Settings › Accounts to reply.");
      const graph = getGraph();
      if (!graph) throw new Error("Instagram and Facebook aren’t set up on this server (META_APP_ID).");
      const sent = await graph.replyToComment(thread.platform, thread.externalId, body, openToken(account.accessTokenEnc));
      externalId = sent.id;
      author = account.handle ?? account.name ?? author;
    }
    const now = new Date();
    await tx.insert(inboxMessages).values({ orgId: ctx.org.id, threadId: thread.id, externalId, direction: "out", author, body, sentAt: now, sentBy: ctx.user.id });
    await tx.update(inboxThreads).set({ lastAt: now, preview: body.slice(0, 200), unread: false }).where(eq(inboxThreads.id, thread.id));
    return { sample: thread.sample };
  });
}

export const sampleMode = () => metaMode() === "sample";

export async function addSamples(ctx: SpaceContext) {
  if (!sampleMode()) throw new Error("Sample conversations are only for sample mode.");
  return withOrg(ctx.org.id, (tx) => addSampleConversations(tx, ctx.org.id, ctx.space.id, new Date(ctx.requestTime)));
}
