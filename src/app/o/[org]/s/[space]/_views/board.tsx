import { Board } from "@/components/board/Board";
import { PanelHost } from "@/components/content/PanelHost";
import { ViewToggle } from "@/components/tasks/bits";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskPanelHost, withoutTask } from "@/components/tasks/TaskPanelHost";
import { getSpaceContent } from "@/server/content";
import { listTasks } from "@/server/tasks";
import type { SpaceContext } from "@/server/tenancy";
import { createContentIn, moveContent } from "../actions";
import { editTask, newTaskIn } from "../task-actions";
import { ShareBanner } from "../board/ShareBanner";
import { viewRoot, type Query } from "./root";

/** VW-01: the Board for a space or, with ctx.project, one project (PJ-02). */
export async function BoardView({ ctx, query }: { ctx: SpaceContext; query: Query }) {
  const org = ctx.org.slug;
  const space = ctx.space.slug;
  const root = viewRoot(ctx);
  const view = query.view === "tasks" ? "tasks" : "content";
  const canEdit = ctx.can("content.edit");
  const projectId = ctx.project?.id ?? null;

  let body;
  if (view === "tasks") {
    const data = await listTasks(ctx);
    body = (
      <TaskBoard
        data={data}
        timeZone={ctx.space.timezone}
        now={ctx.requestTime}
        hrefFor={`${root}/board?view=tasks`}
        canEdit={canEdit}
        move={editTask.bind(null, org, space)}
        create={newTaskIn.bind(null, org, space, projectId)}
      />
    );
  } else {
    const { statuses, cards } = await getSpaceContent(ctx);
    body = (
      <Board
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        cards={cards}
        timezone={ctx.space.timezone}
        basePath={root}
        canEdit={canEdit}
        moveAction={moveContent.bind(null, org, space)}
        createAction={createContentIn.bind(null, org, space, projectId)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <ShareBanner query={query} />
      <div>
        <ViewToggle current={view} />
      </div>
      {body}
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={`${root}/board`} />
      <TaskPanelHost ctx={ctx} org={org} space={space} taskId={typeof query.task === "string" ? query.task : null} closeHref={withoutTask(`${root}/board`, query)} />
    </div>
  );
}
