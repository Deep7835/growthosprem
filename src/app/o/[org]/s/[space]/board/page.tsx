import { Board } from "@/components/board/Board";
import { PanelHost } from "@/components/content/PanelHost";
import { ViewToggle } from "@/components/tasks/bits";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskPanelHost, withoutTask } from "@/components/tasks/TaskPanelHost";
import { getSpaceContent } from "@/server/content";
import { listTasks } from "@/server/tasks";
import { getSpaceContext } from "@/server/tenancy";
import { createContent, moveContent } from "../actions";
import { editTask, newTask } from "../task-actions";
import { ShareBanner } from "./ShareBanner";

export default async function BoardPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/board">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;
  const view = query.view === "tasks" ? "tasks" : "content";
  const taskId = typeof query.task === "string" ? query.task : null;
  const contentId = typeof query.content === "string" ? query.content : null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <ShareBanner query={query} />
      <div>
        <ViewToggle current={view} />
      </div>
      {view === "tasks" ? <TasksView org={org} space={space} ctx={ctx} /> : <ContentView org={org} space={space} ctx={ctx} base={base} />}
      <PanelHost ctx={ctx} org={org} space={space} contentId={contentId} closeHref={`${base}/board`} />
      <TaskPanelHost ctx={ctx} org={org} space={space} taskId={taskId} closeHref={withoutTask(`${base}/board`, query)} />
    </div>
  );
}

async function ContentView({ org, space, ctx, base }: { org: string; space: string; ctx: Awaited<ReturnType<typeof getSpaceContext>>; base: string }) {
  const { statuses, cards } = await getSpaceContent(ctx);
  return (
    <Board
      statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      cards={cards}
      timezone={ctx.space.timezone}
      basePath={base}
      canEdit={ctx.can("content.edit")}
      moveAction={moveContent.bind(null, org, space)}
      createAction={createContent.bind(null, org, space)}
    />
  );
}

async function TasksView({ org, space, ctx }: { org: string; space: string; ctx: Awaited<ReturnType<typeof getSpaceContext>> }) {
  const data = await listTasks(ctx);
  return (
    <TaskBoard
      data={data}
      timeZone={ctx.space.timezone}
      now={ctx.requestTime}
      hrefFor={`/o/${org}/s/${space}/board?view=tasks`}
      canEdit={ctx.can("content.edit")}
      move={editTask.bind(null, org, space)}
      create={newTask.bind(null, org, space)}
    />
  );
}
