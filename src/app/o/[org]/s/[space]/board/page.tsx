import { notFound } from "next/navigation";
import { Board } from "@/components/board/Board";
import { ContentPanel } from "@/components/content/ContentPanel";
import { getContentDetail, getSpaceContent } from "@/server/content";
import { getPublishView } from "@/server/publishing";
import { getSpaceContext } from "@/server/tenancy";
import { createContent, moveContent } from "../actions";
import { ShareBanner } from "./ShareBanner";

export default async function BoardPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/board">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;
  const contentId = typeof query.content === "string" ? query.content : null;

  const validId = contentId && /^[0-9a-f-]{36}$/.test(contentId) ? contentId : null;
  const [{ statuses, cards }, detail, publishing] = await Promise.all([
    getSpaceContent(ctx),
    validId ? getContentDetail(ctx, validId) : null,
    validId ? getPublishView(ctx, validId) : null,
  ]);
  if (contentId && !detail) notFound();
  const canEdit = ctx.can("content.edit");

  return (
    <div className="flex flex-col gap-4 p-6">
      <ShareBanner query={query} />
      <Board
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        cards={cards}
        timezone={ctx.space.timezone}
        basePath={base}
        canEdit={canEdit}
        moveAction={moveContent.bind(null, org, space)}
        createAction={createContent.bind(null, org, space)}
      />
      {detail && publishing && (
        <ContentPanel
          key={detail.item.id}
          detail={detail}
          org={org}
          space={space}
          spaceName={ctx.space.name}
          timezone={ctx.space.timezone}
          canEdit={canEdit}
          canSchedule={ctx.can("content.schedule")}
          publishing={publishing}
          requestTime={ctx.requestTime}
          closeHref={`${base}/board`}
        />
      )}
    </div>
  );
}
