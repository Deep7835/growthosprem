import { redirect } from "next/navigation";

export default async function SpaceSettingsPage({ params }: PageProps<"/o/[org]/s/[space]/settings">) {
  const { org, space } = await params;
  redirect(`/o/${org}/s/${space}/settings/space`);
}
