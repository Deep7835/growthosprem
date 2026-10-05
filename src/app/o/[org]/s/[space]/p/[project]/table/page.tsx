import { getProjectContext } from "@/server/tenancy";
import { TableView } from "../../../_views/table";

export const metadata = { title: "Table" };

/** PJ-02: the space's Table view, filtered to one project. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/p/[project]/table">) {
  const { org, space, project } = await params;
  const ctx = await getProjectContext(org, space, project);
  return <TableView ctx={ctx} query={await searchParams} />;
}
