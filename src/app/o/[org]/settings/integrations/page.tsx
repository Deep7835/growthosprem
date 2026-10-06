import { IntegrationsClient } from "@/components/settings/IntegrationsClient";
import { SettingsHeading, settingsPage } from "@/components/settings/SettingsWindow";
import { feedStatus } from "@/server/calendar-feed";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { feedTasks, newFeedLink, turnOffFeed } from "./actions";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({ params }: PageProps<"/o/[org]/settings/integrations">) {
  const { org } = await params;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  return (
    <div className={settingsPage}>
      <SettingsHeading title="Integrations" body="Connect Plotline to the tools your team already uses." />
      <IntegrationsClient
        org={org}
        firstSpace={spaces[0]?.slug ?? null}
        feed={await feedStatus(ctx)}
        create={newFeedLink.bind(null, org)}
        setTasks={feedTasks.bind(null, org)}
        turnOff={turnOffFeed.bind(null, org)}
      />
    </div>
  );
}
