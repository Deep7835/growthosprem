import { getSpaceContext } from "@/server/tenancy";
import { BoardView } from "../_views/board";

export const metadata = { title: "Board" };

/** VW-01: one column per status, with the Content | Tasks toggle. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/board">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return <BoardView ctx={ctx} query={await searchParams} />;
}
