import { redirect } from "next/navigation";

/** Moved into the settings window. */
export default async function OldAiSettings({ params }: PageProps<"/o/[org]/ai/settings">) {
  const { org } = await params;
  redirect(`/o/${org}/settings/ai`);
}
