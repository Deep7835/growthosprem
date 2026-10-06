import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { effectivePrefs, TYPES } from "@/lib/notifications";
import { loadSettings } from "@/server/notifications";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { PushToggle } from "@/components/notifications/PushToggle";
import { vapidKeys } from "@/lib/push";
import { applyToOtherSpaces, followDefaults, removePushSubscription, savePreferences, savePushSubscription, sendTestPush, setDigest } from "@/app/o/[org]/notifications/actions";

export const metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage({ params, searchParams }: PageProps<"/o/[org]/settings/notifications">) {
  const { org } = await params;
  const query = await searchParams;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  const s = await loadSettings(ctx);
  const wanted = typeof query.scope === "string" ? query.scope : "default";
  const scope = wanted === "default" || spaces.some((sp) => sp.id === wanted) ? wanted : "default";
  const custom = scope !== "default" && Boolean(s.spaces[scope]);

  return (
    <NotificationSettings
      key={scope}
      org={org}
      email={ctx.user.email}
      scope={scope}
      spaces={spaces.map((sp) => ({ id: sp.id, name: sp.name, custom: Boolean(s.spaces[sp.id]) }))}
      custom={custom}
      types={TYPES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
      prefs={effectivePrefs(scope === "default" ? { base: s.base } : { space: s.spaces[scope], base: s.base })}
      digest={s.digest}
      timeZone={s.timeZone}
      emailReady={Boolean(process.env.RESEND_API_KEY)}
      save={savePreferences.bind(null, org, scope)}
      resetScope={scope === "default" ? null : followDefaults.bind(null, org, scope)}
      applyToOthers={scope === "default" ? null : applyToOtherSpaces.bind(null, org, scope)}
      setDigest={setDigest.bind(null, org)}
      push={
        <PushToggle
          publicKey={vapidKeys()?.publicKey ?? null}
          save={savePushSubscription.bind(null, org)}
          remove={removePushSubscription.bind(null, org)}
          test={sendTestPush.bind(null, org)}
        />
      }
    />
  );
}
