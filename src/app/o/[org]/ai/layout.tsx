import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { withOrg } from "@/db";
import { aiConversations } from "@/db/schema";
import { buttonClass } from "@/components/ui";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";

export default async function AiLayout({ children, params }: LayoutProps<"/o/[org]/ai">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const [conversations, spaces] = await Promise.all([
    withOrg(ctx.org.id, (tx) =>
      tx.select().from(aiConversations).where(eq(aiConversations.userId, ctx.user.id)).orderBy(desc(aiConversations.updatedAt)).limit(30),
    ),
    listVisibleSpaces(org),
  ]);
  const base = `/o/${org}/ai`;
  return (
    <div className="flex min-h-[calc(100vh-49px)] flex-col md:flex-row">
      <nav aria-label="AI Copilot" className="flex w-full shrink-0 flex-col gap-1 border-line bg-surface p-3 text-sm md:w-60 md:border-r">
        <Link href={base} className={`${buttonClass("secondary")} mb-2 justify-start`}>
          + New conversation
        </Link>
        <p className="px-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Conversations</p>
        {conversations.length === 0 && <p className="px-2 py-1 text-muted">None yet.</p>}
        {conversations.map((c) => (
          <Link key={c.id} href={`${base}/c/${c.id}`} className="truncate rounded-lg px-2 py-2 text-ink-2 hover:bg-subtle">
            {c.title}
          </Link>
        ))}
        <p className="px-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">Brand Brain</p>
        {spaces.map((s) => (
          <Link key={s.id} href={`/o/${org}/s/${s.slug}/brand`} className="rounded-lg px-2 py-2 text-ink-2 hover:bg-subtle">
            {s.name}
          </Link>
        ))}
        <Link href={`${base}/settings`} className="mt-4 rounded-lg px-2 py-2 text-ink-2 hover:bg-subtle">
          AI settings
        </Link>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
