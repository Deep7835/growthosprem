import { SettingsHeading, settingsPage } from "@/components/settings/SettingsWindow";
import { TagsClient } from "@/components/settings/TagsClient";
import { can } from "@/lib/permissions";
import { listTags } from "@/server/org-settings";
import { getOrgContext } from "@/server/tenancy";
import { addTagAction, deleteTagAction, renameTagAction } from "../actions";

export const metadata = { title: "Tags" };

export default async function TagsPage({ params }: PageProps<"/o/[org]/settings/tags">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const tags = await listTags(ctx);
  return (
    <div className={settingsPage}>
      <SettingsHeading title="Manage tags" body="Content tags for your organisation. Renaming or deleting one changes every post that has it." />
      <TagsClient
        tags={tags}
        canEdit={can(ctx.role, "org.settings")}
        add={addTagAction.bind(null, org)}
        rename={renameTagAction.bind(null, org)}
        remove={deleteTagAction.bind(null, org)}
      />
    </div>
  );
}
