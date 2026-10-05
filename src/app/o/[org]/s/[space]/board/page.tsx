import { Board } from "@/components/board/Board";
import { PanelHost } from "@/components/content/PanelHost";
import { getSpaceContent } from "@/server/content";
import { getSpaceContext } from "@/server/tenancy";
import { createContent, moveContent } from "../actions";
import { ShareBanner } from "./ShareBanner";

export default async function BoardPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/board">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;
  const { statuses, cards } = await getSpaceContent(ctx);

  return (
    <div className="flex flex-col gap-4 p-6">
      <ShareBanner query={query} />
      <Board
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        cards={cards}
        timezone={ctx.space.timezone}
        basePath={base}
        canEdit={ctx.can("content.edit")}
        moveAction={moveContent.bind(null, org, space)}
        createAction={createContent.bind(null, org, space)}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={`${base}/board`} />
    </div>
  );
}
