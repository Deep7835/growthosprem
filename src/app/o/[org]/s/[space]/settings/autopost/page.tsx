import { AutopostForm } from "@/components/accounts/AutopostForm";
import { withOrg } from "@/db";
import { loadContentStatuses } from "@/server/content";
import { getSpaceContext } from "@/server/tenancy";
import { saveAutopost } from "./actions";

export const metadata = { title: "Autopost" };

/** PB-04: space autopost settings. */
export default async function AutopostPage({ params }: PageProps<"/o/[org]/s/[space]/settings/autopost">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const statuses = await withOrg(ctx.org.id, (tx) => loadContentStatuses(tx, ctx.space.id));
  return (
    <AutopostForm
      space={ctx.space}
      statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category, autopostEligible: s.autopostEligible }))}
      canEdit={ctx.can("space.settings")}
      save={saveAutopost.bind(null, org, space)}
    />
  );
}
