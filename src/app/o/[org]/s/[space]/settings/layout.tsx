import { SettingsTabs } from "@/components/shell/SettingsTabs";

export default async function SpaceSettingsLayout({ children, params }: LayoutProps<"/o/[org]/s/[space]/settings">) {
  const { org, space } = await params;
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 p-6 pb-14">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold">Space settings</h1>
        <SettingsTabs base={`/o/${org}/s/${space}`} />
      </div>
      {children}
    </div>
  );
}
