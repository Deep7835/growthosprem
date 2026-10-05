import { getSpaceContext } from "@/server/tenancy";
import { NotesView } from "../_views/notes";

export const metadata = { title: "Notes" };

/** VW-06: briefs and meeting notes for the space. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/notes">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return <NotesView ctx={ctx} query={await searchParams} />;
}
