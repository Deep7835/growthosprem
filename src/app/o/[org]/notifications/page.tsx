import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { ago, dayLabel, TYPES, typeOf } from "@/lib/notifications";
import { listNotifications, readFilters } from "@/server/notifications";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { deleteClearedNotifications, setClearedState, setReadState } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ params, searchParams }: PageProps<"/o/[org]/notifications">) {
  const { org } = await params;
  const filters = readFilters(await searchParams);
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  const { rows, more, counts, typeCounts } = await listNotifications(ctx, filters, spaces.map((s) => s.id));
  const zone = spaces[0]?.timezone ?? "Asia/Kolkata";

  return (
    <NotificationCenter
      org={org}
      filters={filters}
      counts={counts}
      typeCounts={typeCounts}
      more={more}
      types={TYPES.map((t) => ({ id: t.id, label: t.label }))}
      spaces={spaces.map((s) => ({ id: s.id, name: s.name, color: s.avatarColor }))}
      items={rows.map(({ n, spaceName, spaceColor }) => ({
        id: n.id,
        kind: n.kind,
        type: typeOf(n.kind),
        title: n.title,
        body: n.body,
        href: n.href,
        read: Boolean(n.readAt),
        space: spaceName ? { name: spaceName, color: spaceColor ?? "#E4E3DC" } : null,
        when: ago(n.createdAt, ctx.requestTime),
        at: n.createdAt.toISOString(),
        day: dayLabel(n.createdAt, ctx.requestTime, zone),
      }))}
      setRead={setReadState.bind(null, org)}
      setCleared={setClearedState.bind(null, org)}
      deleteCleared={deleteClearedNotifications.bind(null, org)}
    />
  );
}
