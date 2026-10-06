import { PanelHost } from "@/components/content/PanelHost";
import { tagSuggestions } from "@/server/org-settings";
import { ContentTable } from "@/components/table/ContentTable";
import { ViewToggle } from "@/components/tasks/bits";
import { TaskPanelHost, withoutTask } from "@/components/tasks/TaskPanelHost";
import { TaskTable } from "@/components/tasks/TaskTable";
import { isoDate, zonedParts } from "@/lib/analytics/time";
import { loadTable } from "@/server/table";
import { listTasks } from "@/server/tasks";
import type { SpaceContext } from "@/server/tenancy";
import { editTask, newTaskIn } from "../task-actions";
import { bulkAction, editCell, saveTableView } from "../table/actions";
import { viewRoot, type Query } from "./root";

/** VW-02, VW-03: every post (or task) as a row, for a space or one project. */
export async function TableView({ ctx, query }: { ctx: SpaceContext; query: Query }) {
  const org = ctx.org.slug;
  const space = ctx.space.slug;
  const base = `${viewRoot(ctx)}/table`;
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
          create={newTaskIn.bind(null, org, space, ctx.project?.id ?? null)}
        />
        {taskPanel}
      </div>
    );
  }

  const [data, tagOptions] = await Promise.all([loadTable(ctx), tagSuggestions(ctx.org.id)]);
  const now = zonedParts(new Date(ctx.requestTime), ctx.space.timezone);
  const saved = ctx.user.preferences.tables?.[ctx.space.id] ?? {};
  // In a project the rows are already that project's, so a saved project filter doesn't apply.
  const filters = ctx.project ? Object.fromEntries(Object.entries(saved.filters ?? {}).filter(([k]) => k !== "project")) : saved.filters;

  return (
    <>
      <div className="px-4 pt-4 md:px-6 md:pt-6">
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
        saved={{ ...saved, filters }}
        edit={editCell.bind(null, org, space)}
        bulk={bulkAction.bind(null, org, space)}
        saveView={saveTableView.bind(null, org, space)}
        tagOptions={tagOptions}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={base} />
      {taskPanel}
    </>
  );
}
