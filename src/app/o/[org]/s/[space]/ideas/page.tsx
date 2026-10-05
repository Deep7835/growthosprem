import { IdeaBank } from "@/components/ideas/IdeaBank";
import { listIdeas } from "@/server/ideas";
import { getSpaceContext } from "@/server/tenancy";
import { acceptPillars, addIdea, editIdea, removeIdeas, suggestPillars, toContent } from "./actions";

export const metadata = { title: "Idea Bank" };

/** VW-07: ideas before they become posts. */
export default async function IdeasPage({ params }: PageProps<"/o/[org]/s/[space]/ideas">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const data = await listIdeas(ctx);
  return (
    <IdeaBank
      org={org}
      space={space}
      data={data}
      canEdit={ctx.can("content.edit")}
      canUseAi={ctx.can("ai.use")}
      add={addIdea.bind(null, org, space)}
      edit={editIdea.bind(null, org, space)}
      remove={removeIdeas.bind(null, org, space)}
      toContent={toContent.bind(null, org, space)}
      suggest={suggestPillars.bind(null, org, space)}
      accept={acceptPillars.bind(null, org, space)}
    />
  );
}
