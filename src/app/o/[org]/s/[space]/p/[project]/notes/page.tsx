import { getProjectContext } from "@/server/tenancy";
import { NotesView } from "../../../_views/notes";

export const metadata = { title: "Notes" };

/** PJ-02: the space's Notes view, filtered to one project. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/p/[project]/notes">) {
  const { org, space, project } = await params;
  const ctx = await getProjectContext(org, space, project);
  return <NotesView ctx={ctx} query={await searchParams} />;
}
