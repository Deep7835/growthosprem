import { getProjectContext } from "@/server/tenancy";
import { PreviewsView } from "../../../_views/previews";

export const metadata = { title: "Previews" };

/** PJ-02: the space's Previews view, filtered to one project. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/p/[project]/previews">) {
  const { org, space, project } = await params;
  const ctx = await getProjectContext(org, space, project);
  return <PreviewsView ctx={ctx} query={await searchParams} />;
}
