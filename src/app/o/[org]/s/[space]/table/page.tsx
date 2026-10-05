import { PanelHost } from "@/components/content/PanelHost";
import { ViewToggle } from "@/components/tasks/bits";
import { TaskPanelHost, withoutTask } from "@/components/tasks/TaskPanelHost";
import { TaskTable } from "@/components/tasks/TaskTable";
import { listTasks } from "@/server/tasks";
import { editTask, newTask } from "../task-actions";
import { ContentTable } from "@/components/table/ContentTable";
import { isoDate, zonedParts } from "@/lib/analytics/time";
import { loadTable } from "@/server/table";
import { getSpaceContext } from "@/server/tenancy";
import { bulkAction, editCell, saveTableView } from "./actions";

export const metadata = { title: "Table" };

/** VW-02, VW-03: every post as a row, with inline editing, filters, sort and bulk actions. */
export default async function TablePage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/table">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}/table`;
  const taskPanel = <TaskPanelHost ctx={ctx} org={org} space={space} taskId={typeof query.task === "string" ? query.task : null} closeHref={withoutTask(base, query)} />;

  if (query.view === "tasks") {
    const tasks = await listTasks(ctx);
    return (
      <div className="flex flex-col gap-4 p-6">
        <div>
          <ViewToggle current="tasks" />
        </div>
        <TaskTable
          data={tasks}
          me={ctx.user.id}
          timeZone={ctx.space.timezone}
          now={ctx.requestTime}
          hrefFor={`${base}?view=tasks`}
          canEdit={ctx.can("content.edit")}
          edit={editTask.bind(null, org, space)}
          create={newTask.bind(null, org, space)}
        />
        {taskPanel}
      </div>
    );
  }

  const data = await loadTable(ctx);
  const now = zonedParts(new Date(ctx.requestTime), ctx.space.timezone);

  return (
    <>
      <div className="px-6 pt-6">
        <ViewToggle current="content" />
      </div>
      <ContentTable
        org={org}
        space={space}
        basePath={base}
        data={data}
        me={ctx.user.id}
        nowLocal={`${isoDate(now)}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`}
        timeZoneLabel={ctx.space.timezone === "Asia/Kolkata" ? "IST" : ctx.space.timezone}
        canEdit={ctx.can("content.edit")}
        saved={withProject(ctx.user.preferences.tables?.[ctx.space.id] ?? {}, typeof query.project === "string" ? query.project : null)}
        edit={editCell.bind(null, org, space)}
        bulk={bulkAction.bind(null, org, space)}
        saveView={saveTableView.bind(null, org, space)}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={base} />
      {taskPanel}
    </>
  );
}

/** ?project= (from search) shows that project's posts on top of the saved view. */
function withProject<T extends { filters?: Record<string, unknown> }>(saved: T, project: string | null): T {
  if (!project || !/^[0-9a-f-]{36}$/.test(project)) return saved;
  return { ...saved, filters: { ...saved.filters, project } };
}
