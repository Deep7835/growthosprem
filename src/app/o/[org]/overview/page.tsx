import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { withOrg } from "@/db";
import { contentItems, memberships, socialAccounts, statuses } from "@/db/schema";
import { EmptyState, StatusDot } from "@/components/ui";
import { formatSchedule } from "@/lib/format";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";

export const metadata = { title: "Overview" };

const CATEGORY_LABEL = { not_started: "Not started", active: "Active", completed: "Completed", closed: "Closed" } as const;

export default async function OverviewPage({ params }: PageProps<"/o/[org]/overview">) {
  const { org } = await params;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  const spaceIds = spaces.map((s) => s.id);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  if (spaceIds.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No spaces yet" body="Ask an Admin to add you to a client space, or create one if you are an Admin." />
      </div>
    );
  }

  const data = await withOrg(ctx.org.id, async (tx) => {
    const [byCategory, waiting, upcoming, accounts, members] = await Promise.all([
      tx
        .select({ category: statuses.category, count: sql<number>`count(*)::int` })
        .from(contentItems)
        .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
        .where(and(inArray(contentItems.spaceId, spaceIds), isNull(contentItems.archivedAt)))
        .groupBy(statuses.category),
      tx
        .select({ id: contentItems.id, title: contentItems.title, spaceId: contentItems.spaceId, scheduledAt: contentItems.scheduledAt })
        .from(contentItems)
        .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
        .where(and(inArray(contentItems.spaceId, spaceIds), eq(statuses.reviewRole, "in_review"), isNull(contentItems.archivedAt)))
        .orderBy(asc(contentItems.scheduledAt)),
      tx
        .select({
          id: contentItems.id,
          title: contentItems.title,
          spaceId: contentItems.spaceId,
          scheduledAt: contentItems.scheduledAt,
          statusName: statuses.name,
          statusColor: statuses.color,
        })
        .from(contentItems)
        .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
        .where(and(inArray(contentItems.spaceId, spaceIds), isNotNull(contentItems.scheduledAt), gte(contentItems.scheduledAt, new Date()), isNull(contentItems.archivedAt)))
        .orderBy(asc(contentItems.scheduledAt))
        .limit(8),
      // Seeded sample accounts don't count: only a real connection completes the step.
      tx.select({ id: socialAccounts.id }).from(socialAccounts).where(isNotNull(socialAccounts.accessTokenEnc)).limit(1),
      tx.select({ id: memberships.id }).from(memberships),
    ]);
    return { byCategory, waiting, upcoming, hasAccount: accounts.length > 0, memberCount: members.length };
  });

  const checklist = [
    { label: "Connect a social account", done: data.hasAccount, href: spaces[0] ? `/o/${org}/s/${spaces[0].slug}/settings/accounts` : undefined },
    { label: "Invite a teammate", done: data.memberCount > 1, href: `/o/${org}/settings/members` },
    { label: "Build Brand Brain", done: false },
    { label: "Schedule a first post", done: data.upcoming.length > 0 },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const link = (spaceId: string, id: string) => `/o/${org}/s/${spaceById.get(spaceId)?.slug}/board?content=${id}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Good to see you, {ctx.user.name}</h1>
        <p className="mt-1 text-muted">What’s happening across {spaces.length === 1 ? "your space" : `your ${spaces.length} spaces`} right now.</p>
      </div>

      {doneCount < checklist.length && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">
            Setup checklist <span className="font-normal text-muted">· {doneCount} of {checklist.length} done</span>
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label} className={`flex items-center gap-2 text-sm ${c.done ? "text-muted line-through" : ""}`}>
                <span className={`grid size-5 place-items-center rounded-full text-[11px] ${c.done ? "bg-success-bg text-success" : "border border-line"}`}>
                  {c.done ? "✓" : ""}
                </span>
                {"href" in c && c.href && !c.done ? (
                  <Link href={c.href} className="underline">
                    {c.label}
                  </Link>
                ) : (
                  c.label
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((cat) => (
          <div key={cat} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">{CATEGORY_LABEL[cat]}</p>
            <p className="font-display text-3xl font-bold">{data.byCategory.find((b) => b.category === cat)?.count ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Waiting for client approval</h2>
          {data.waiting.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing is waiting on a client.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line-soft">
              {data.waiting.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={link(w.spaceId, w.id)} className="font-semibold hover:underline">
                    {w.title}
                  </Link>
                  <span className="shrink-0 text-muted">{spaceById.get(w.spaceId)?.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Upcoming</h2>
          {data.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing scheduled yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line-soft">
              {data.upcoming.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot color={u.statusColor} />
                    <Link href={link(u.spaceId, u.id)} className="truncate font-semibold hover:underline">
                      {u.title}
                    </Link>
                  </span>
                  <span className="shrink-0 text-muted">
                    {formatSchedule(u.scheduledAt, spaceById.get(u.spaceId)?.timezone ?? ctx.org.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
