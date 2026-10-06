import { desc, eq } from "drizzle-orm";
import { withOrg } from "@/db";
import { aiConversations } from "@/db/schema";
import { AiNav } from "@/components/ai/AiNav";
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
  return (
    <div className="flex min-h-[calc(100vh-49px)] flex-col md:flex-row">
      <AiNav org={org} conversations={conversations.map((c) => ({ id: c.id, title: c.title }))} spaces={spaces.map((s) => ({ slug: s.slug, name: s.name }))} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
