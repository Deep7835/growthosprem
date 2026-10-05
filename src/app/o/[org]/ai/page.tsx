import { Chat } from "@/components/ai/Chat";
import { anthropic, creditsUsedThisMonth } from "@/server/ai/service";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { approveAiAction, dismissAiAction, undoAiAction } from "./actions";
import { ORG_TEMPLATES, SPACE_TEMPLATES } from "./templates";

export const metadata = { title: "AI Copilot" };

export default async function CopilotHome({ params, searchParams }: PageProps<"/o/[org]/ai">) {
  const { org } = await params;
  const { space } = await searchParams;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  const used = await creditsUsedThisMonth(ctx.org.id);
  const initial = typeof space === "string" && spaces.some((s) => s.slug === space) ? space : spaces.length === 1 ? spaces[0].slug : "org";

  return (
    <Chat
      key={initial}
      org={org}
      conversationId={null}
      turns={[]}
      scopes={[{ value: "org", label: `All of ${ctx.org.name}` }, ...spaces.map((s) => ({ value: s.slug, label: s.name }))]}
      initialScope={initial}
      templates={initial === "org" ? ORG_TEMPLATES : SPACE_TEMPLATES}
      aiReady={anthropic() !== null}
      credits={{ used, budget: ctx.org.aiMonthlyCredits }}
      approve={approveAiAction.bind(null, org)}
      dismiss={dismissAiAction.bind(null, org)}
      undo={undoAiAction.bind(null, org)}
    />
  );
}
