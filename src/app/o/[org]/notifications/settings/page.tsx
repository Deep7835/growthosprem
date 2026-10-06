import { redirect } from "next/navigation";

/** Moved into the settings window; old links (emails, bookmarks) still work. */
export default async function OldNotificationSettings({ params, searchParams }: PageProps<"/o/[org]/notifications/settings">) {
  const { org } = await params;
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/o/${org}/settings/notifications${query.size ? `?${query}` : ""}`);
}
