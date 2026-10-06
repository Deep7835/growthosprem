import { BrandingClient } from "@/components/settings/BrandingClient";
import { SettingsHeading, settingsPage } from "@/components/settings/SettingsWindow";
import { can } from "@/lib/permissions";
import { getBranding } from "@/server/org-settings";
import { getOrgContext } from "@/server/tenancy";
import { saveBrandingAction } from "../actions";

export const metadata = { title: "Branding" };

export default async function BrandingPage({ params }: PageProps<"/o/[org]/settings/branding">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  return (
    <div className={settingsPage}>
      <SettingsHeading title="Organisation branding" body="How your organisation looks to clients." />
      <BrandingClient orgName={ctx.org.name} initial={await getBranding(ctx)} canEdit={can(ctx.role, "org.settings")} save={saveBrandingAction.bind(null, org)} />
    </div>
  );
}
