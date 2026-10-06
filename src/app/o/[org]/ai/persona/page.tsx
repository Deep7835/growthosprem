import { PersonaClient } from "@/components/ai/PersonaClient";
import { getPersona } from "@/server/ai-tools";
import { getOrgContext } from "@/server/tenancy";
import { deletePersonaAction, savePersonaAction } from "../tools-actions";

export const metadata = { title: "Your persona" };

export default async function PersonaPage({ params }: PageProps<"/o/[org]/ai/persona">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  return <PersonaClient initial={await getPersona(ctx.org.id, ctx.user.id)} save={savePersonaAction.bind(null, org)} remove={deletePersonaAction.bind(null, org)} />;
}
