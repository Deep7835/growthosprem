import { StatusesClient } from "@/components/statuses/StatusesClient";
import { STATUS_TEMPLATES } from "@/lib/status-templates";
import { loadStatuses } from "@/server/statuses";
import { getSpaceContext } from "@/server/tenancy";
import { changeStatus, createStatus, importStatusSet, removeStatus, reorderStatus } from "./actions";

export const metadata = { title: "Statuses" };

/** SP-02 Statuses tab (PRD 6.4). Managers and up can change them; everyone else can look. */
export default async function StatusesPage({ params }: PageProps<"/o/[org]/s/[space]/settings/statuses">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const data = await loadStatuses(ctx);
  if (!ctx.can("space.settings")) {
    return (
      <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
        Only Managers, Admins and the Owner can change statuses. This space uses {data.content.map((s) => s.name).join(", ")} for posts and {data.task.map((s) => s.name).join(", ")} for tasks.
      </p>
    );
  }
  return (
    <StatusesClient
      content={data.content}
      task={data.task}
      otherSpaces={data.otherSpaces}
      templates={Object.entries(STATUS_TEMPLATES).map(([key, t]) => ({ key, label: t.label, description: t.description }))}
      create={createStatus.bind(null, org, space)}
      change={changeStatus.bind(null, org, space)}
      reorder={reorderStatus.bind(null, org, space)}
      remove={removeStatus.bind(null, org, space)}
      importSet={importStatusSet.bind(null, org, space)}
    />
  );
}
