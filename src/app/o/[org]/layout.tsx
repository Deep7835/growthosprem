import { Sidebar } from "@/components/shell/Sidebar";
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

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        orgSlug={orgSlug}
        user={ctx.user}
        role={ctx.role}
        devUsers={devUsers}
        trialDaysLeft={ctx.trialDaysLeft}
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
