import { SaveField, Section } from "@/components/settings/ProfileClient";
import { SettingsHeading, settingsPage } from "@/components/settings/SettingsWindow";
import { can } from "@/lib/permissions";
import { getOrgContext } from "@/server/tenancy";
import { saveOrgName } from "../actions";

export const metadata = { title: "Organisation" };

export default async function GeneralPage({ params }: PageProps<"/o/[org]/settings/general">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const canEdit = can(ctx.role, "org.settings");
  return (
    <div className={settingsPage}>
      <SettingsHeading title="Organisation" body="Update your organisation information." />
      <Section title="Name" body={canEdit ? "Shown in the sidebar, on invites and on client review pages." : "Only Owners and Admins can change this."}>
        <SaveField label="Organisation name" initial={ctx.org.name} save={saveOrgName.bind(null, org)} maxLength={80} disabled={!canEdit} />
      </Section>
      <Section title="Region" body="Set when the organisation was created.">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Country", ctx.org.country],
            ["Time zone", ctx.org.timezone],
            ["Currency", ctx.org.currency],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
