import { getProjectContext } from "@/server/tenancy";
import { CalendarView } from "../../../_views/calendar";

export const metadata = { title: "Calendar" };

/** PJ-02: the space's Calendar view, filtered to one project. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/p/[project]/calendar">) {
  const { org, space, project } = await params;
  const ctx = await getProjectContext(org, space, project);
  return <CalendarView ctx={ctx} query={await searchParams} />;
}
