import { getSpaceContext } from "@/server/tenancy";
import { PreviewsView } from "../_views/previews";

export const metadata = { title: "Previews" };

/** VW-05: posts as they will look on each platform. */
export default async function Page({ params, searchParams }: PageProps<"/o/[org]/s/[space]/previews">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return <PreviewsView ctx={ctx} query={await searchParams} />;
}
