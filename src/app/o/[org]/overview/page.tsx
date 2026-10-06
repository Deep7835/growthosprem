import { isNotNull } from "drizzle-orm";
import { withOrg } from "@/db";
import { memberships, socialAccounts } from "@/db/schema";
import { Dashboard } from "@/components/overview/Dashboard";
import { EmptyState } from "@/components/ui";
import { loadDashboard } from "@/server/overview";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { quickCreate } from "../s/[space]/actions";
import { saveOverviewLayout } from "./actions";

export const metadata = { title: "Overview" };

/** The organisation dashboard (PRD 6.2): cards each person can arrange, filtered by space and time. */
export default async function OverviewPage({ params, searchParams }: PageProps<"/o/[org]/overview">) {
  const { org } = await params;
  const query = await searchParams;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);

  if (spaces.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No spaces yet" body="Ask an Admin to add you to a client space, or create one if you are an Admin." />
      </div>
    );
  }

  const wanted = typeof query.spaces === "string" ? query.spaces.split(",") : [];
  const chosen = spaces.filter((s) => wanted.includes(s.slug)).map((s) => s.slug);
  const inView = chosen.length ? spaces.filter((s) => chosen.includes(s.slug)) : spaces;
  const range = [7, 14, 30].includes(Number(query.range)) ? Number(query.range) : 14;

  const [data, setup] = await Promise.all([
    loadDashboard(
      ctx.org.id,
      inView.map((s) => s.id),
      ctx.user.id,
      { now: new Date(ctx.requestTime), rangeDays: range },
    ),
    withOrg(ctx.org.id, async (tx) => {
      // Seeded sample accounts don't count: only a real connection completes the step.
      const [accounts, members] = await Promise.all([tx.select({ id: socialAccounts.id }).from(socialAccounts).where(isNotNull(socialAccounts.accessTokenEnc)).limit(1), tx.select({ id: memberships.id }).from(memberships)]);
      return { hasAccount: accounts.length > 0, memberCount: members.length };
    }),
  ]);

  const checklist = [
    { label: "Connect a social account", done: setup.hasAccount, href: `/o/${org}/s/${spaces[0].slug}/settings/accounts` },
    { label: "Invite a teammate", done: setup.memberCount > 1, href: `/o/${org}/settings/members?invite=1` },
    { label: "Build Brand Brain", done: false, href: `/o/${org}/s/${spaces[0].slug}/brand` },
    { label: "Schedule a first post", done: data.hasScheduled },
  ];

  return (
    <Dashboard
      org={org}
      orgName={ctx.org.name}
      userName={ctx.user.name}
      spaces={spaces.map((s) => ({ id: s.id, slug: s.slug, name: s.name, color: s.avatarColor, timezone: s.timezone }))}
      chosen={chosen}
      rangeDays={range}
      now={ctx.requestTime}
      data={data}
      checklist={checklist}
      layout={ctx.user.preferences.overview ?? {}}
      saveLayout={saveOverviewLayout.bind(null, org)}
      quickCreate={quickCreate.bind(null, org)}
      // Everyone in a space can create posts, tasks and notes there.
      canCreate
    />
  );
}
