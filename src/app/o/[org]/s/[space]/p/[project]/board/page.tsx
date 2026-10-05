import { getProjectContext } from "@/server/tenancy";
import { BoardView } from "../../../_views/board";

export const metadata = { title: "Board" };

/** PJ-02: the space's Board view, filtered to one project. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/p/[project]/board">) {
  const { org, space, project } = await params;
  const ctx = await getProjectContext(org, space, project);
  return <BoardView ctx={ctx} query={await searchParams} />;
}
