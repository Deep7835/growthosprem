import { redirect } from "next/navigation";

export default async function SpaceIndex({ params }: PageProps<"/o/[org]/s/[space]">) {
  const { org, space } = await params;
  redirect(`/o/${org}/s/${space}/board`);
}
