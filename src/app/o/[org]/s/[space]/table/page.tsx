import { PanelHost } from "@/components/content/PanelHost";
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
  const data = await loadTable(ctx);
  const now = zonedParts(new Date(ctx.requestTime), ctx.space.timezone);
  const base = `/o/${org}/s/${space}/table`;

  return (
    <>
      <ContentTable
        org={org}
        space={space}
        basePath={base}
        data={data}
        me={ctx.user.id}
        nowLocal={`${isoDate(now)}T${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`}
        timeZoneLabel={ctx.space.timezone === "Asia/Kolkata" ? "IST" : ctx.space.timezone}
        canEdit={ctx.can("content.edit")}
        saved={ctx.user.preferences.tables?.[ctx.space.id] ?? {}}
        edit={editCell.bind(null, org, space)}
        bulk={bulkAction.bind(null, org, space)}
        saveView={saveTableView.bind(null, org, space)}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={base} />
    </>
  );
}
