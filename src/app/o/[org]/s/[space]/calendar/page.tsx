import { getSpaceContext } from "@/server/tenancy";
import { CalendarView } from "../_views/calendar";

export const metadata = { title: "Calendar" };

/** VW-04: the organisation calendar's behaviour, limited to one space. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/calendar">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return <CalendarView ctx={ctx} query={await searchParams} />;
}
