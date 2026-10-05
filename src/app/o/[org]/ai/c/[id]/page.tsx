import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withOrg } from "@/db";
import { aiConversations, spaces } from "@/db/schema";
import { Chat } from "@/components/ai/Chat";
import { anthropic, creditsUsedThisMonth } from "@/server/ai/service";
import { conversationView } from "@/server/ai/view";
import { getOrgContext } from "@/server/tenancy";
import { approveAiAction, deleteConversation, dismissAiAction, undoAiAction } from "../../actions";
import { ORG_TEMPLATES, SPACE_TEMPLATES } from "../../templates";

export const metadata = { title: "AI Copilot" };

export default async function ConversationPage({ params }: PageProps<"/o/[org]/ai/c/[id]">) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .select({ conversation: aiConversations, spaceName: spaces.name })
      .from(aiConversations)
      .leftJoin(spaces, eq(spaces.id, aiConversations.spaceId))
      .where(and(eq(aiConversations.id, parsed.data), eq(aiConversations.userId, ctx.user.id))),
  );
  // Conversations are private to the person who started them.
  if (!row) notFound();
  const [turns, used] = await Promise.all([conversationView(ctx.org.id, row.conversation.id), creditsUsedThisMonth(ctx.org.id)]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-4">
        <h1 className="truncate text-lg font-semibold">{row.conversation.title}</h1>
        <form action={deleteConversation.bind(null, org, row.conversation.id)}>
          <button type="submit" className="text-xs text-muted underline">
            Delete conversation
          </button>
        </form>
      </div>
      <Chat
        org={org}
        conversationId={row.conversation.id}
        turns={turns}
        scopes={null}
        initialScope={row.spaceName ?? `All of ${ctx.org.name}`}
        templates={row.spaceName ? SPACE_TEMPLATES : ORG_TEMPLATES}
        aiReady={anthropic() !== null}
        credits={{ used, budget: ctx.org.aiMonthlyCredits }}
        approve={approveAiAction.bind(null, org)}
        dismiss={dismissAiAction.bind(null, org)}
        undo={undoAiAction.bind(null, org)}
      />
    </div>
  );
}
