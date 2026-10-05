import { notFound } from "next/navigation";
import { SPACE_COLORS, TIMEZONES } from "@/app/onboarding/options";
import { SpacesAdmin } from "@/components/spaces/SpacesAdmin";
import { createSpaceOptions, listSpacesForAdmin } from "@/server/spaces";
import { getOrgContext } from "@/server/tenancy";
import { addSpace, archiveSpace, removeSpace, restoreSpace } from "./actions";

export const metadata = { title: "Spaces" };

/** Settings › Spaces (SP-01, SP-05, SP-06): the Owner and Admins. */
export default async function SpacesPage({ params, searchParams }: PageProps<"/o/[org]/settings/spaces">) {
  const { org } = await params;
  const query = await searchParams;
  const ctx = await getOrgContext(org);
  if (ctx.role !== "owner" && ctx.role !== "admin") notFound();
  const [spaces, options] = await Promise.all([listSpacesForAdmin(ctx), createSpaceOptions(ctx)]);
  const timezones = TIMEZONES.includes(ctx.org.timezone as (typeof TIMEZONES)[number]) ? TIMEZONES : [ctx.org.timezone, ...TIMEZONES];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-14">
      <SpacesAdmin
        org={org}
        isOwner={ctx.role === "owner"}
        spaces={spaces}
        options={{ ...options, colors: SPACE_COLORS, timezones, defaultTimezone: ctx.org.timezone }}
        startOpen={query.new === "1"}
        add={addSpace.bind(null, org)}
        archive={archiveSpace.bind(null, org)}
        remove={removeSpace.bind(null, org)}
        restore={restoreSpace.bind(null, org)}
      />
    </div>
  );
}
