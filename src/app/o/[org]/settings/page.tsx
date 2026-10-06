import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: PageProps<"/o/[org]/settings">) {
  const { org } = await params;
  redirect(`/o/${org}/settings/profile`);
}
