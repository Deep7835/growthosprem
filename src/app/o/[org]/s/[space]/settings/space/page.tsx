import { SPACE_COLORS, TIMEZONES } from "@/app/onboarding/options";
import { SpaceForm } from "@/components/spaces/SpaceForm";
import { PLATFORM_COLOR } from "@/lib/analytics/colors";
import type { Platform } from "@/lib/placements";
import { PROJECT_COLORS } from "@/server/projects";
import { getSpaceContext } from "@/server/tenancy";
import { saveSpace } from "./actions";

export const metadata = { title: "Space settings" };

/** SP-03: the Space tab. */
export default async function SpaceTab({ params }: PageProps<"/o/[org]/s/[space]/settings/space">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const timezones = TIMEZONES.includes(ctx.space.timezone as (typeof TIMEZONES)[number]) ? TIMEZONES : [ctx.space.timezone, ...TIMEZONES];
  return (
    <SpaceForm
      canEdit={ctx.can("space.settings")}
      name={ctx.space.name}
      color={ctx.space.avatarColor}
      timezone={ctx.space.timezone}
      colors={SPACE_COLORS.includes(ctx.space.avatarColor as (typeof SPACE_COLORS)[number]) ? SPACE_COLORS : [ctx.space.avatarColor, ...SPACE_COLORS]}
      timezones={timezones}
      platformColors={{ ...PLATFORM_COLOR, ...ctx.space.platformColors }}
      defaultColors={PLATFORM_COLOR}
      palette={PROJECT_COLORS}
      hidden={ctx.space.hiddenPlatforms as Platform[]}
      save={saveSpace.bind(null, org, space)}
    />
  );
}
