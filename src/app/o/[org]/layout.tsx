import { and, count, desc, eq, isNull } from "drizzle-orm";
import { withOrg } from "@/db";
import { notifications } from "@/db/schema";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { Sidebar } from "@/components/shell/Sidebar";
import { markRead } from "./notifications/actions";
import { TopBar } from "@/components/shell/TopBar";
import { listDevUsers } from "@/server/session";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[org]">) {
  const { org: orgSlug } = await params;
  const [ctx, spaces, devUsers] = await Promise.all([
    getOrgContext(orgSlug),
    listVisibleSpaces(orgSlug),
    listDevUsers(),
  ]);

  const [recent, [{ unread }]] = await withOrg(ctx.org.id, (tx) =>
    Promise.all([
      tx.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(12),
      tx
        .select({ unread: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
    ]),
  );
  const ago = (d: Date) => {
    const minutes = Math.max(0, Math.round((ctx.requestTime - d.getTime()) / 60000));
    const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    return minutes < 60 ? f.format(-minutes, "minute") : minutes < 2880 ? f.format(-Math.round(minutes / 60), "hour") : f.format(-Math.round(minutes / 1440), "day");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        orgSlug={orgSlug}
        user={ctx.user}
        role={ctx.role}
        devUsers={devUsers}
        trialDaysLeft={ctx.trialDaysLeft}
        bell={
          <NotificationBell
            unread={unread}
            markRead={markRead.bind(null, orgSlug)}
            items={recent.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: Boolean(n.readAt), when: ago(n.createdAt) }))}
          />
        }
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          orgSlug={orgSlug}
          orgName={ctx.org.name}
          spaces={spaces.map((s) => ({ slug: s.slug, name: s.name, avatarColor: s.avatarColor }))}
          canInvite={ctx.role !== "editor"}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
