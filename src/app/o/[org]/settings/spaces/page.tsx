import { settingsPage } from "@/components/settings/SettingsWindow";
import { notFound } from "next/navigation";
import { SPACE_COLORS, TIMEZONES } from "@/app/onboarding/options";
import { SpacesAdmin } from "@/components/spaces/SpacesAdmin";
import { currencyFor, formatMoney, PLANS } from "@/lib/billing/plans";
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
  const perSpace = PLANS[ctx.billing.plan].perSpace[currencyFor(ctx.org.country)] * 100;
  const priceNote =
    ctx.billing.phase === "trial"
      ? "Free during the trial."
      : `Adds ${formatMoney(perSpace, currencyFor(ctx.org.country))} a month on the ${PLANS[ctx.billing.plan].name} plan, plus GST where it applies.`;
  const timezones = TIMEZONES.includes(ctx.org.timezone as (typeof TIMEZONES)[number]) ? TIMEZONES : [ctx.org.timezone, ...TIMEZONES];

  return (
    <div className={settingsPage}>
      <SpacesAdmin
        org={org}
        isOwner={ctx.role === "owner"}
        spaces={spaces}
        options={{ ...options, colors: SPACE_COLORS, timezones, defaultTimezone: ctx.org.timezone, priceNote }}
        startOpen={query.new === "1"}
        add={addSpace.bind(null, org)}
        archive={archiveSpace.bind(null, org)}
        remove={removeSpace.bind(null, org)}
        restore={restoreSpace.bind(null, org)}
      />
    </div>
  );
}
