import { NotificationBell } from "@/components/shell/NotificationBell";
import { ago, typeOf } from "@/lib/notifications";
import { bellData } from "@/server/notifications";
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

  const { recent, unread } = await bellData(ctx);

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
            allHref={`/o/${orgSlug}/notifications`}
            items={recent.map((n) => ({ id: n.id, type: typeOf(n.kind), title: n.title, body: n.body, href: n.href, read: Boolean(n.readAt), when: ago(n.createdAt, ctx.requestTime) }))}
          />
        }
      />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          orgSlug={orgSlug}
          orgName={ctx.org.name}
          spaces={spaces.map((s) => ({ slug: s.slug, name: s.name, avatarColor: s.avatarColor }))}
          canInvite={ctx.role !== "editor"}
          unread={unread}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
