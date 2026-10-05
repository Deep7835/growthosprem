import { getSpaceContext } from "@/server/tenancy";
import { TableView } from "../_views/table";

export const metadata = { title: "Table" };

/** VW-02, VW-03: every post as a row, with inline editing, filters, sort and bulk actions. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/table">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return <TableView ctx={ctx} query={await searchParams} />;
}
