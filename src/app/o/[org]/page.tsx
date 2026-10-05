import { redirect } from "next/navigation";

export default async function OrgIndex({ params }: PageProps<"/o/[org]">) {
  const { org } = await params;
  redirect(`/o/${org}/overview`);
}
