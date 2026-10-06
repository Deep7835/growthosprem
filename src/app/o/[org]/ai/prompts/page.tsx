import { PromptsClient } from "@/components/ai/PromptsClient";
import { listPrompts } from "@/server/ai-tools";
import { getOrgContext } from "@/server/tenancy";
import { PROMPT_LIBRARY } from "../templates";
import { deletePromptAction, savePromptAction } from "../tools-actions";

export const metadata = { title: "Prompt library" };

export default async function PromptsPage({ params }: PageProps<"/o/[org]/ai/prompts">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const saved = await listPrompts(ctx);
  return <PromptsClient org={org} library={PROMPT_LIBRARY} saved={saved.map((p) => ({ id: p.id, title: p.title, body: p.body }))} save={savePromptAction.bind(null, org)} remove={deletePromptAction.bind(null, org)} />;
}
