import Link from "next/link";
import { AvatarStack, EmptyState, PlacementChip, PublishState, StatusDot } from "@/components/ui";
import { formatSchedule } from "@/lib/format";
import { getSpaceContent } from "@/server/content";
import { getSpaceContext } from "@/server/tenancy";

export default async function TablePage({ params }: PageProps<"/o/[org]/s/[space]/table">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const { statuses, cards } = await getSpaceContent(ctx);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const base = `/o/${org}/s/${space}`;

  if (cards.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No posts yet" body="Create your first post from the Board." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-subtle text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Platforms</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Assignees</th>
              <th className="px-4 py-3">Publish</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => {
              const status = statusById.get(c.statusId);
              return (
                <tr key={c.id} className="border-t border-line-soft hover:bg-subtle">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`${base}/board?content=${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {status && <StatusDot color={status.color} />}
                      {status?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {c.kinds.map((k) => (
                        <PlacementChip key={k} kind={k} />
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{formatSchedule(c.scheduledAt, ctx.space.timezone) ?? "Unscheduled"}</td>
                  <td className="px-4 py-3 text-ink-2">{c.projectName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AvatarStack people={c.assignees} />
                  </td>
                  <td className="px-4 py-3">
                    <PublishState state={c.publishState} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
