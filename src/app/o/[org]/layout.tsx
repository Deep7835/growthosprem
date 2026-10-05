import { and, asc, inArray, isNull } from "drizzle-orm";
import { withOrg } from "@/db";
import { projects } from "@/db/schema";
import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ago, typeOf } from "@/lib/notifications";
import { bellData } from "@/server/notifications";
import { Sidebar } from "@/components/shell/Sidebar";
import { markRead } from "./notifications/actions";
import { TopBar } from "@/components/shell/TopBar";
import { listDevUsers } from "@/server/session";
import { getOrgContext, listArchivedSpaces, listVisibleSpaces } from "@/server/tenancy";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[org]">) {
  const { org: orgSlug } = await params;
  const [ctx, spaces, archivedSpaces, devUsers] = await Promise.all([
    getOrgContext(orgSlug),
    listVisibleSpaces(orgSlug),
    listArchivedSpaces(orgSlug),
    listDevUsers(),
  ]);

  const { recent, unread } = await bellData(ctx);
  const openProjects = spaces.length
    ? await withOrg(ctx.org.id, (tx) =>
        tx
          .select({ id: projects.id, name: projects.name, color: projects.color, spaceId: projects.spaceId })
          .from(projects)
          .where(and(inArray(projects.spaceId, spaces.map((s) => s.id)), isNull(projects.archivedAt)))
          .orderBy(asc(projects.name)),
      )
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        orgSlug={orgSlug}
        user={ctx.user}
        role={ctx.role}
        devUsers={devUsers}
        trialDaysLeft={ctx.trialDaysLeft}
        billing={{ phase: ctx.billing.phase, planName: PLANS[ctx.billing.plan].name }}
        bell={
          <NotificationBell
            unread={unread}
            markRead={markRead.bind(null, orgSlug)}
            allHref={`/o/${orgSlug}/notifications`}
            items={recent.map((n) => ({ id: n.id, type: typeOf(n.kind), title: n.title, body: n.body, href: n.href, read: Boolean(n.readAt), when: ago(n.createdAt, ctx.requestTime) }))}
          />
        }
      />
      {ctx.billing.locked && (
        <p role="alert" className="flex flex-wrap items-center justify-center gap-2 border-b border-danger bg-danger-bg px-4 py-2.5 text-sm text-danger">
          <strong>{ctx.trialDaysLeft === 0 ? "Your free trial has ended." : "Your plan has ended."}</strong> Everything is read-only until a plan is chosen.
          {ctx.role === "owner" ? (
            <Link href={`/o/${orgSlug}/settings/billing`} className="font-semibold underline">
              Choose a plan
            </Link>
          ) : (
            <span>Ask the Owner to choose a plan.</span>
          )}
        </p>
      )}
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar
          orgSlug={orgSlug}
          orgName={ctx.org.name}
          spaces={spaces.map((s) => ({ slug: s.slug, name: s.name, avatarColor: s.avatarColor, projects: openProjects.filter((p) => p.spaceId === s.id) }))}
          canInvite={ctx.role !== "editor"}
          unread={unread}
          canManageSpaces={ctx.role === "owner" || ctx.role === "admin"}
          archived={archivedSpaces.map((s) => ({ slug: s.slug, name: s.name, avatarColor: s.avatarColor }))}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
