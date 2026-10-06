import { ProfileClient } from "@/components/settings/ProfileClient";
import { SettingsHeading, settingsPage } from "@/components/settings/SettingsWindow";
import { authMode } from "@/lib/auth-config";
import { getOrgContext } from "@/server/tenancy";
import { setCalendarPrefs } from "../../calendar-actions";
import { saveDisplayName } from "../actions";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ params }: PageProps<"/o/[org]/settings/profile">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  return (
    <div className={settingsPage}>
      <SettingsHeading title="Profile" body="Update your details and preferences." />
      <ProfileClient
        name={ctx.user.name}
        email={ctx.user.email}
        account={authMode()}
        colorBy={ctx.user.preferences.calendarColor ?? "platform"}
        weekStart={ctx.user.preferences.weekStartsOn ?? 0}
        saveName={saveDisplayName.bind(null, org)}
        savePrefs={setCalendarPrefs.bind(null, org)}
      />
    </div>
  );
}
