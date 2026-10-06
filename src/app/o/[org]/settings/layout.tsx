import { SettingsWindow } from "@/components/settings/SettingsWindow";

export default async function OrgSettingsLayout({ children, params }: LayoutProps<"/o/[org]/settings">) {
  const { org } = await params;
  return <SettingsWindow org={org}>{children}</SettingsWindow>;
}
