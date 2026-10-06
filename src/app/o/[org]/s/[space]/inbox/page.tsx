import { eq } from "drizzle-orm";
import { withOrg } from "@/db";
import { socialAccounts } from "@/db/schema";
import { InboxView } from "@/components/inbox/InboxView";
import { getThread, listThreads, sampleMode } from "@/server/inbox";
import { getSpaceContext } from "@/server/tenancy";
import { doneAction, replyAction, samplesAction } from "./actions";

export const metadata = { title: "Inbox" };

/** Inbox (beta): comments on this space's posts. */
export default async function InboxPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/inbox">) {
  const { org, space } = await params;
  const q = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const filter = {
    kind: (q.kind === "comment" || q.kind === "message" ? q.kind : "all") as "all" | "comment" | "message",
    status: (q.status === "done" ? "done" : "open") as "open" | "done",
    q: typeof q.q === "string" ? q.q.slice(0, 80) : "",
  };
  const [threads, accounts] = await Promise.all([
    filter.kind === "message" ? Promise.resolve([]) : listThreads(ctx, filter),
    withOrg(ctx.org.id, (tx) => tx.select({ token: socialAccounts.accessTokenEnc }).from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id))),
  ]);
  const wanted = typeof q.t === "string" && /^[0-9a-f-]{36}$/.test(q.t) ? q.t : null;
  const open = wanted ? await getThread(ctx, wanted) : null;
  const row = (t: (typeof threads)[number]) => ({ id: t.id, platform: t.platform, kind: t.kind, participant: t.participant, preview: t.preview, lastAt: t.lastAt.toISOString(), unread: t.unread, done: t.done, sample: t.sample });

  return (
    <InboxView
      base={`/o/${org}/s/${space}/inbox`}
      filter={filter}
      threads={threads.map(row)}
      current={
        open && {
          ...row(open.thread),
          unread: false,
          messages: open.messages.map((m) => ({ id: m.id, direction: m.direction, author: m.author, body: m.body, sentAt: m.sentAt.toISOString() })),
          post: open.post && { title: open.post.title, permalink: open.post.permalink },
        }
      }
      connected={accounts.some((a) => a.token)}
      sampleMode={sampleMode()}
      canReply={ctx.can("content.schedule")}
      canEdit={ctx.can("content.edit")}
      now={ctx.requestTime}
      reply={replyAction.bind(null, org, space)}
      setDone={doneAction.bind(null, org, space)}
      addSamples={samplesAction.bind(null, org, space)}
    />
  );
}
