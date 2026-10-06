import { SettingsWindow } from "@/components/settings/SettingsWindow";
import { SettingsTabs } from "@/components/shell/SettingsTabs";
import { getSpaceContext } from "@/server/tenancy";

export default async function SpaceSettingsLayout({ children, params }: LayoutProps<"/o/[org]/s/[space]/settings">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  return (
    <SettingsWindow org={org}>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-6 pb-14 sm:px-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl text-xl font-bold text-ink" style={{ background: ctx.space.avatarColor }}>
              {ctx.space.name[0]}
            </span>
            <span>
              <h1 className="text-xl font-semibold">{ctx.space.name}</h1>
              <span className="text-sm text-muted">Update this space’s settings</span>
            </span>
          </div>
          <SettingsTabs base={`/o/${org}/s/${space}`} />
        </div>
        {children}
      </div>
    </SettingsWindow>
  );
}
